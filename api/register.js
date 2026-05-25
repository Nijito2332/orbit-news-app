function clean(s) { return (s || '').replace(/^﻿/, '').replace(/[^\x20-\x7E]/g, '').trim(); }
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SUPA_KEY = clean(process.env.SUPABASE_SERVICE_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Server config missing. Check SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.' });
  }

  const VALID_LANGS = new Set(['es', 'en', 'fr', 'de']);
  const { email, password, daily_brief = true } = req.body || {};
  const name          = String(req.body?.name || '').slice(0, 80);
  const email_language = VALID_LANGS.has(req.body?.email_language) ? req.body.email_language : 'es';
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ error: 'Email inválido' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Contraseña demasiado corta' });

  const H = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

  try {
    const cr = await fetch(SUPA_URL + '/auth/v1/admin/users', {
      method: 'POST', headers: H,
      body: JSON.stringify({ email, password, user_metadata: { name }, email_confirm: true }),
    });
    const cd = await cr.json();
    if (!cr.ok) {
      const msg = cd.message || cd.error || 'Error al crear cuenta';
      return res.status(cd.message && cd.message.includes('already') ? 409 : 400).json({ error: msg });
    }
    const lr = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: H,
      body: JSON.stringify({ email, password }),
    });
    const ld = await lr.json();
    if (!lr.ok) return res.json({ success: true, requiresLogin: true });
    // Save email language preference to profile (language column is used by email service)
    if (cd.id) {
      await fetch(SUPA_URL + '/rest/v1/profiles?id=eq.' + cd.id, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify({ language: email_language }),
      }).catch(() => {});
    }
    return res.json({ success: true, session: ld });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
