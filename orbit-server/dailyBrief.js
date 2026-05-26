// ════════════════════════════════════════════════════════
//  ORBIT — Daily Brief Scheduler
//  Uses raw fetch to Supabase REST API (no heavy SDK)
// ════════════════════════════════════════════════════════

import fetch from 'node-fetch';
import { sendDailyBrief, sendDailyBriefDebug, buildUserSections } from './emailService.js';
import { store } from './store.js';

const S_URL = process.env.SUPABASE_URL || '';
const S_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SH    = () => ({ 'apikey': S_KEY, 'Authorization': `Bearer ${S_KEY}`, 'Content-Type': 'application/json' });

// Track who already received brief today
const sentToday = new Set();

// ─── Fetch subscribed users via REST ─────────────────────────────────────────
async function getSubscribedUsers() {
  if (!S_URL || !S_KEY) return [];
  try {
    const r = await fetch(`${S_URL}/rest/v1/profiles?select=*`, { headers: SH() });
    if (!r.ok) {
      console.error('[Daily Brief] Supabase query failed:', r.status, await r.text());
      return [];
    }
    const all = await r.json();
    return all.filter(u => u.daily_brief === true);
  } catch(e) {
    console.error('[Daily Brief] getSubscribedUsers error:', e.message);
    return [];
  }
}

// ─── Check if it's 20:00 in a given timezone ─────────────────────────────────
function is20oclock(timezone) {
  try {
    const now  = new Date();
    const hour = parseInt(now.toLocaleString('en', { timeZone: timezone, hour: '2-digit', hour12: false }));
    const min  = parseInt(now.toLocaleString('en', { timeZone: timezone, minute: '2-digit' }));
    return hour === 20 && min < 5;
  } catch(_) { return false; }
}

// ─── Send brief to all users whose 20:00 window is now ───────────────────────
export async function checkAndSendBriefs() {
  if (!S_URL || !S_KEY) return;
  const today = new Date().toDateString();
  try {
    const users = await getSubscribedUsers();
    if (!users.length) return;

    const allNews = store.getAll();
    let sent = 0;

    for (const user of users) {
      const key = `${user.id}-${today}`;
      if (sentToday.has(key)) continue;

      const tz = user.timezone || 'Europe/Madrid';
      if (!is20oclock(tz)) continue;

      const emailLang = user.email_language || user.language || 'es';
      const sections  = buildUserSections(allNews, user.favorites, emailLang);
      if (!sections.length) continue;

      const ok = await sendDailyBrief({ user, sections });
      if (ok) { sentToday.add(key); sent++; }
      await new Promise(r => setTimeout(r, 200));
    }

    if (sent > 0) console.log(`[Daily Brief] Sent ${sent} emails at 20:00`);
    if (new Date().getHours() === 0) sentToday.clear();
  } catch(e) {
    console.error('[Daily Brief] Error:', e.message);
  }
}

// ─── Force-send to ALL subscribed users right now (bypasses 20:00 check) ─────
export async function sendBriefsNow() {
  if (!S_URL || !S_KEY) return { error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)' };
  const today = new Date().toDateString();
  try {
    const users = await getSubscribedUsers();
    if (!users.length) return { sent: 0, skipped: 0, reason: 'No subscribed users' };

    const allNews = store.getAll();
    let sent = 0, skipped = 0;
    const errors = [];

    for (const user of users) {
      const key = `${user.id}-${today}`;
      if (sentToday.has(key)) { skipped++; continue; }

      const emailLang = user.email_language || user.language || 'es';
      const sections  = buildUserSections(allNews, user.favorites, emailLang);
      if (!sections.length) { skipped++; errors.push(`${user.email}: no sections`); continue; }

      const result = await sendDailyBriefDebug({ user, sections });
      if (result.ok) { sentToday.add(key); sent++; }
      else { errors.push(`${user.email}: ${result.error}`); }
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Daily Brief] Manual send: ${sent} sent, ${skipped} skipped`);
    return { sent, skipped, total: users.length, errors };
  } catch(e) {
    console.error('[Daily Brief] sendBriefsNow error:', e.message);
    return { error: e.message };
  }
}

// ─── Start the 20:00 checker (runs every 60 seconds) ─────────────────────────
export function startDailyBriefScheduler() {
  if (!S_URL || !S_KEY) {
    console.log('[Daily Brief] Supabase not configured — scheduler disabled');
    return;
  }
  console.log('[Daily Brief] Scheduler started');
  setInterval(checkAndSendBriefs, 60_000);
  checkAndSendBriefs().catch(() => {});
}
