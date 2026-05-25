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
    return res.status(500).json({ error: 'Server config missing.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });

  const H = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const lr = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email, password }),
    });
    const ld = await lr.json();
    if (!lr.ok) {
      const msg = ld.error_description || ld.message || ld.error || 'Email o contrasena incorrectos';
      return res.status(401).json({ error: msg });
    }
    return res.json({ success: true, session: ld });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
