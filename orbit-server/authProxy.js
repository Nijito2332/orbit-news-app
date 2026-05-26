// ════════════════════════════════════════════════════════
//  ORBIT Server — Auth Proxy
//  Browser calls our backend → backend calls Supabase
//  Bypasses browser's ISO-8859-1 header restriction completely
// ════════════════════════════════════════════════════════

import fetch from 'node-fetch';

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key

const supaHeaders = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
};

// ─── Register ─────────────────────────────────────────────────────────────────
export async function proxyRegister(req, res) {
  const { email, password, name, daily_brief = true } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        email,
        password,
        user_metadata: { name: name || '' },
        email_confirm: true, // Auto-confirm so user can login immediately
      }),
    });

    const data = await r.json();
    if (!r.ok || data.error) {
      const msg = data.message || data.error || 'Error al crear cuenta';
      if (msg.toLowerCase().includes('already') || msg.includes('duplicate')) {
        return res.status(409).json({ error: 'Ya existe una cuenta con este email' });
      }
      return res.status(r.status).json({ error: msg });
    }

    // Update daily_brief preference if false
    if (!daily_brief && data.id) {
      await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${data.id}`, {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ daily_brief: false }),
      });
    }

    // Now sign them in to get a session token
    const loginRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const session = await loginRes.json();

    if (!loginRes.ok || session.error) {
      // Account created but couldn't auto-login — return partial success
      return res.json({ success: true, requiresLogin: true, message: 'Cuenta creada. Inicia sesion.' });
    }

    return res.json({ success: true, session });
  } catch(e) {
    console.error('[AuthProxy] Register error:', e.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// ─── Login ─────────────────────────────────────────────────────────────────────
export async function proxyLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await r.json();
    if (!r.ok || data.error) {
      const msg = data.error_description || data.error || 'Email o contrasena incorrectos';
      return res.status(401).json({ error: msg });
    }

    return res.json({ success: true, session: data });
  } catch(e) {
    console.error('[AuthProxy] Login error:', e.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

// ─── Get profile ───────────────────────────────────────────────────────────────
export async function proxyGetProfile(req, res) {
  const { user_id } = req.params;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${user_id}&limit=1`, {
      headers: supaHeaders,
    });
    const rows = await r.json();
    return res.json(rows[0] || null);
  } catch(e) {
    return res.status(500).json({ error: 'Error al obtener perfil' });
  }
}

// ─── Update profile ────────────────────────────────────────────────────────────
export async function proxyUpdateProfile(req, res) {
  const { user_id } = req.params;
  const updates = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({ ...updates, last_seen: new Date().toISOString() }),
    });
    const rows = await r.json();
    return res.json(rows[0] || null);
  } catch(e) {
    return res.status(500).json({ error: 'Error al actualizar perfil' });
  }
}
