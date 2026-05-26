// ════════════════════════════════════════════════════════
//  ORBIT Server — Express SSE Server
//  The realtime backbone of the planetary news engine
//
//  Endpoints:
//    GET /health          → Server health check
//    GET /api/stories     → Full story dump (initial load)
//    GET /api/stats       → Ingestion statistics
//    GET /stream          → Server-Sent Events (realtime push)
// ════════════════════════════════════════════════════════

import express from 'express';
import cors    from 'cors';
import fetch   from 'node-fetch';
import { store }                from './store.js';
import { startIngestionLoop, runIngestionCycle } from './ingestion.js';
import { startDailyBriefScheduler, sendBriefsNow } from './dailyBrief.js';
import { startPulseEngine, getTrends } from './pulseEngine.js';

// Track last ingestion to avoid hammering on every client connect
let _lastIngestion    = 0;
let _ingestionRunning = false;

// ─── Auth proxy (inline to avoid import issues) ────────────────────────────────
const S_URL = process.env.SUPABASE_URL || '';
const S_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SH    = () => ({ 'apikey': S_KEY, 'Authorization': `Bearer ${S_KEY}`, 'Content-Type': 'application/json' });

async function proxyRegister(req, res) {
  const { email, password, name, daily_brief = true, email_language = 'es' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const r = await fetch(`${S_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: SH(),
      body: JSON.stringify({ email, password, user_metadata: { name: name || '' }, email_confirm: true }),
    });
    const d = await r.json();
    if (!r.ok) {
      const msg = d.message || d.error || 'Error al crear cuenta';
      const code = msg.toLowerCase().includes('already') ? 409 : 400;
      return res.status(code).json({ error: msg });
    }
    // Auto-login to return session
    const lr = await fetch(`${S_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: SH(),
      body: JSON.stringify({ email, password }),
    });
    const session = await lr.json();
    if (!lr.ok) return res.json({ success: true, requiresLogin: true });
    // Save email language preference to profile
    if (d.id) {
      await fetch(`${S_URL}/rest/v1/profiles?id=eq.${d.id}`, {
        method: 'PATCH', headers: { ...SH(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ language: email_language }),
      }).catch(() => {});
    }
    return res.json({ success: true, session });
  } catch(e) { return res.status(500).json({ error: 'Error del servidor: ' + e.message }); }
}

async function proxyLogin(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const r = await fetch(`${S_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: SH(),
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(401).json({ error: d.error_description || d.error || 'Email o contrasena incorrectos' });
    return res.json({ success: true, session: d });
  } catch(e) { return res.status(500).json({ error: 'Error del servidor: ' + e.message }); }
}

async function proxyGetProfile(req, res) {
  const { user_id } = req.params;
  try {
    const r = await fetch(`${S_URL}/rest/v1/profiles?id=eq.${user_id}&limit=1`, { headers: SH() });
    const rows = await r.json();
    return res.json(rows[0] || null);
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

const ALLOWED_PROFILE_FIELDS = new Set(['name','language','email_language','timezone','daily_brief','favorites','followed_countries','avatar_url']);
async function proxyUpdateProfile(req, res) {
  const { user_id } = req.params;
  if (!user_id || !/^[0-9a-f-]{36}$/i.test(user_id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const safe = { last_seen: new Date().toISOString() };
    for (const [k, v] of Object.entries(req.body || {})) { if (ALLOWED_PROFILE_FIELDS.has(k)) safe[k] = v; }
    const r = await fetch(`${S_URL}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH', headers: { ...SH(), 'Prefer': 'return=representation' },
      body: JSON.stringify(safe),
    });
    const rows = await r.json();
    return res.json(rows[0] || null);
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── CORS — allow any origin (mobile apps, any domain) ───────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-admin-secret'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: '64kb' }));

// ─── Rate limiter — simple in-memory, per IP ─────────────────────────────────
const _rateMap = new Map();
function rateLimit(maxPerMin = 15) {
  return (req, res, next) => {
    const ip  = (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    const now = Date.now();
    const e   = _rateMap.get(ip) || { n: 0, reset: now + 60_000 };
    if (now > e.reset) { e.n = 0; e.reset = now + 60_000; }
    e.n++;
    _rateMap.set(ip, e);
    if (e.n > maxPerMin) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); _rateMap.forEach((v,k) => { if (now > v.reset) _rateMap.delete(k); }); }, 5 * 60_000);

// ─── Admin guard — requires ADMIN_SECRET header or query param ────────────────
function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Admin no configurado' });
  const provided = req.headers['x-admin-secret'] || req.query.secret;
  if (provided !== secret) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// ─── SSE Client Registry ──────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastToAll(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  let dead = [];
  sseClients.forEach(res => {
    try { res.write(msg); }
    catch(_) { dead.push(res); }
  });
  dead.forEach(r => sseClients.delete(r));
}

// ─── Heartbeat — keeps SSE connections alive through proxies ──────────────────
setInterval(() => {
  const ping = `: heartbeat ${new Date().toISOString()}\n\n`;
  sseClients.forEach(res => { try { res.write(ping); } catch(_) {} });
}, 25_000);

// ─── Auth proxy routes — rate limited ────────────────────────────────────────
app.post('/api/auth/register', rateLimit(5),  proxyRegister);
app.post('/api/auth/login',    rateLimit(10), proxyLogin);
app.get('/api/auth/profile/:user_id',         proxyGetProfile);
app.patch('/api/auth/profile/:user_id',       proxyUpdateProfile);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Manual email trigger — requires ADMIN_SECRET
app.post('/api/admin/send-briefs', requireAdmin, async (req, res) => {
  console.log('[Admin] Manual brief send triggered');
  const result = await sendBriefsNow();
  res.json({ ...result, serverStories: store.getAll().length });
});

// Supabase diagnostic — requires ADMIN_SECRET
app.get('/api/admin/debug', requireAdmin, async (req, res) => {
  const S_URL = process.env.SUPABASE_URL || '';
  const S_KEY = process.env.SUPABASE_SERVICE_KEY || '';
  if (!S_URL || !S_KEY) return res.json({ error: 'env vars missing', S_URL: !!S_URL, S_KEY: !!S_KEY });
  try {
    const r = await fetch(`${S_URL}/rest/v1/profiles?select=*`, {
      headers: { 'apikey': S_KEY, 'Authorization': `Bearer ${S_KEY}` },
    });
    const body = await r.text();
    res.json({ status: r.status, ok: r.ok, url: S_URL.slice(0, 30) + '...', body: body.slice(0, 500) });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  const stats = store.getStats();
  res.json({
    status:    'alive',
    stories:   stats.total,
    countries: stats.countries,
    clients:   sseClients.size,
    uptime:    Math.round(process.uptime()),
    lastUpdate: new Date(stats.lastUpdate).toISOString(),
  });
});

// Full story dump for initial page load
app.get('/api/stories', (req, res) => {
  const stories = store.getAll();
  const stats   = store.getStats();
  res.json({ stories, stats, timestamp: Date.now() });
});

// Statistics
app.get('/api/stats', (req, res) => {
  res.json(store.getStats());
});

// Real-time trending topics from Pulse Engine
app.get('/api/trends', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit || '20'), 40);
  const trends = getTrends(limit);
  res.json({ trends, count: trends.length, timestamp: Date.now() });
});

// ════════════════════════════════════════════════════════
//  SERVER-SENT EVENTS — The realtime channel
//  Client connects once, receives updates FOREVER
// ════════════════════════════════════════════════════════
app.get('/stream', (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering
    'Access-Control-Allow-Origin': '*',
  });

  // Register this client
  sseClients.add(res);
  console.log(`[SSE] Client connected. Total: ${sseClients.size}`);

  // Send initial full story set immediately
  const initPayload = {
    type:      'init',
    stories:   store.getAll(),
    stats:     store.getStats(),
    timestamp: Date.now(),
  };
  res.write(`data: ${JSON.stringify(initPayload)}\n\n`);

  // Send immediate ping to confirm connection
  res.write(`: connected\n\n`);

  // ── On-connect fresh cycle ────────────────────────────────────────────────
  // If data is stale (>35s since last ingestion), fire a fresh cycle immediately.
  // This means every page reload gets fresh data within seconds, not 60s wait.
  const staleness = Date.now() - _lastIngestion;
  if (!_ingestionRunning && staleness > 35_000) {
    _ingestionRunning = true;
    console.log(`[SSE] Stale data (${Math.round(staleness/1000)}s), triggering fresh cycle…`);
    runIngestionCycle(broadcastToAll)
      .then(() => { _lastIngestion = Date.now(); })
      .catch(e => console.warn('[SSE] On-connect cycle error:', e.message))
      .finally(() => { _ingestionRunning = false; });
  }

  // Remove client on disconnect
  const cleanup = () => {
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

// ─── Start everything ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  ORBIT Realtime News Engine               ║
║  Listening on port ${PORT}                    ║
║  SSE endpoint: /stream                   ║
║  Stories API:  /api/stories              ║
║  Health:       /health                   ║
╚═══════════════════════════════════════════╝
  `);

  // Start the continuous ingestion loop (never stops)
  // Wrap to track lastIngestion time
  const wrappedBroadcast = (payload) => {
    broadcastToAll(payload);
    if (payload.type === 'init' || payload.type === 'update') {
      _lastIngestion = Date.now();
    }
  };
  startIngestionLoop(wrappedBroadcast);
  _lastIngestion = Date.now(); // mark server start as first ingestion

  // Start the 20:00 Daily Brief scheduler
  startDailyBriefScheduler();

  // Start Pulse Engine — real trending from RSS (refreshes every 5 min)
  startPulseEngine();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[ORBIT] Shutting down gracefully…');
  sseClients.forEach(res => { try { res.end(); } catch(_) {} });
  process.exit(0);
});

// ─── Safety net — never crash on unhandled async errors ──────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[ORBIT] Unhandled rejection (non-fatal):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[ORBIT] Uncaught exception (non-fatal):', err.message);
});
