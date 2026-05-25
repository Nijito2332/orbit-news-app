const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

// Only these fields may be written by clients
const ALLOWED_PATCH_FIELDS = new Set([
  'name', 'language', 'email_language', 'timezone', 'daily_brief',
  'favorites', 'followed_countries', 'avatar_url',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const userId = req.query.id;
  if (!userId || !UUID_RE.test(userId)) return res.status(400).json({ error: 'id inválido' });

  const H = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'GET') {
      const r = await fetch(SUPA_URL + '/rest/v1/profiles?id=eq.' + userId + '&limit=1', { headers: H });
      const rows = await r.json();
      return res.json(rows[0] || null);
    }
    if (req.method === 'PATCH') {
      // Whitelist: never allow clients to write arbitrary columns
      const safe = {};
      for (const [k, v] of Object.entries(req.body || {})) {
        if (ALLOWED_PATCH_FIELDS.has(k)) safe[k] = v;
      }
      safe.last_seen = new Date().toISOString();
      const r = await fetch(SUPA_URL + '/rest/v1/profiles?id=eq.' + userId, {
        method: 'PATCH', headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(safe),
      });
      const rows = await r.json();
      return res.json(rows[0] || null);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
