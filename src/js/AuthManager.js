// ════════════════════════════════════════════════════════
//  ORBIT — Auth Manager (Supabase)
//  Handles: registration, login, profile, daily brief prefs
// ════════════════════════════════════════════════════════

import { getLang, t } from './i18n.js';

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    return _supabase;
  } catch(e) {
    console.warn('[Auth] Supabase not available:', e.message);
    return null;
  }
}

// ─── Auth state ────────────────────────────────────────────────────────────────
let _user    = null;
let _profile = null;

export function getUser()    { return _user; }
export function getProfile() { return _profile; }
export function isLoggedIn() { return !!_user; }

// ─── Initialize — check existing session ──────────────────────────────────────
export async function initAuth(onAuthChange) {
  const sb = await getSupabase();
  if (!sb) return;

  // Restore session from localStorage
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    _user = session.user;
    await loadProfile();
    onAuthChange?.(_user, _profile);
  }

  // Listen for auth changes
  sb.auth.onAuthStateChange(async (event, session) => {
    _user = session?.user || null;
    if (_user) {
      await loadProfile();
    } else {
      _profile = null;
    }
    onAuthChange?.(_user, _profile);
  });
}

async function loadProfile() {
  const sb = await getSupabase();
  if (!sb || !_user) return;
  const { data } = await sb.from('profiles').select('*').eq('id', _user.id).single();
  _profile = data;
}

// ─── Register with email + password ───────────────────────────────────────────
export async function register({ email, password, name }) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Auth not configured');

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

// ─── Login ─────────────────────────────────────────────────────────────────────
export async function login({ email, password }) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Auth not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ─── Magic link (passwordless) ────────────────────────────────────────────────
export async function loginMagicLink(email) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Auth not configured');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

// ─── Logout ────────────────────────────────────────────────────────────────────
export async function logout() {
  const sb = await getSupabase();
  await sb?.auth.signOut();
  _user = _profile = null;
}

// ─── Update profile ────────────────────────────────────────────────────────────
export async function updateProfile(updates) {
  const sb = await getSupabase();
  if (!sb || !_user) return;
  const { data, error } = await sb
    .from('profiles')
    .update({ ...updates, last_seen: new Date().toISOString() })
    .eq('id', _user.id)
    .select()
    .single();
  if (!error) _profile = data;
  return data;
}

// ─── Toggle daily brief ────────────────────────────────────────────────────────
export async function toggleDailyBrief(enabled) {
  return updateProfile({ daily_brief: enabled });
}

// ─── Track article read ────────────────────────────────────────────────────────
export async function trackRead(article) {
  const sb = await getSupabase();
  if (!sb || !_user) return;
  await sb.from('article_reads').insert({
    user_id:       _user.id,
    article_id:    article.id,
    article_title: article.title,
    category:      article.category,
    country:       article.country,
  });
}

// ─── Save/unsave article ───────────────────────────────────────────────────────
export async function saveArticle(article) {
  const sb = await getSupabase();
  if (!sb || !_user) return false;

  // Check if already saved
  const { data: existing } = await sb
    .from('saved_articles')
    .select('id')
    .eq('user_id', _user.id)
    .eq('article_id', article.id)
    .single();

  if (existing) {
    await sb.from('saved_articles').delete().eq('id', existing.id);
    return false; // Unsaved
  } else {
    await sb.from('saved_articles').insert({
      user_id:       _user.id,
      article_id:    article.id,
      article_title: article.title,
      article_url:   article.url,
      category:      article.category,
      country:       article.country,
      source:        article.source,
    });
    return true; // Saved
  }
}

// ─── Get saved articles ────────────────────────────────────────────────────────
export async function getSavedArticles() {
  const sb = await getSupabase();
  if (!sb || !_user) return [];
  const { data } = await sb
    .from('saved_articles')
    .select('*')
    .eq('user_id', _user.id)
    .order('saved_at', { ascending: false });
  return data || [];
}

// ════════════════════════════════════════════════════════
//  AUTH MODAL UI
//  Shows login/register form in a premium dark modal
// ════════════════════════════════════════════════════════

let _modal = null;

export function showAuthModal(mode = 'login', onSuccess) {
  if (_modal) _modal.remove();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);padding:20px';

  modal.innerHTML = `
    <div style="background:#0D0D1C;border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:32px;width:100%;max-width:380px;position:relative">

      <!-- Close -->
      <button id="auth-close" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.06);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;color:rgba(255,255,255,0.5);font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:22px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;letter-spacing:0.2em">◎ ORBIT</div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;background:rgba(255,255,255,0.04);border-radius:10px;padding:3px;margin-bottom:24px">
        <button id="tab-login" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;${mode==='login'?'background:rgba(0,212,255,0.15);color:#00D4FF':'background:transparent;color:rgba(255,255,255,0.4)'}">
          Sign in
        </button>
        <button id="tab-register" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;${mode==='register'?'background:rgba(0,212,255,0.15);color:#00D4FF':'background:transparent;color:rgba(255,255,255,0.4)'}">
          Create account
        </button>
      </div>

      <!-- Form -->
      <form id="auth-form" style="display:flex;flex-direction:column;gap:12px">

        ${mode === 'register' ? `
        <input id="auth-name" type="text" placeholder="Your name" autocomplete="name"
          style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>
        ` : ''}

        <input id="auth-email" type="email" placeholder="Email address" autocomplete="email" required
          style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>

        <input id="auth-pass" type="password" placeholder="Password" autocomplete="${mode==='login'?'current-password':'new-password'}" required
          style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>

        ${mode === 'register' ? `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.5)">
          <input id="auth-brief" type="checkbox" checked style="margin-top:2px;accent-color:#00D4FF"/>
          Receive ORBIT Daily Brief at 20:00 with top news in your language
        </label>
        ` : ''}

        <div id="auth-error" style="font-size:12px;color:#FF4757;display:none;padding:8px 12px;background:rgba(255,71,87,0.1);border-radius:8px"></div>

        <button type="submit" id="auth-submit"
          style="width:100%;padding:13px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border:none;border-radius:10px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-top:4px">
          ${mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        ${mode === 'login' ? `
        <div style="text-align:center">
          <button type="button" id="auth-magic" style="background:none;border:none;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.4);text-decoration:underline">
            Sign in without password (magic link)
          </button>
        </div>
        ` : ''}

      </form>

      <p style="text-align:center;font-size:11px;color:rgba(255,255,255,0.2);margin-top:20px;line-height:1.6">
        By continuing you agree to ORBIT's Terms of Use and Privacy Policy.
      </p>
    </div>
  `;

  document.body.appendChild(modal);
  _modal = modal;

  // Wire events
  modal.querySelector('#auth-close').onclick = () => { modal.remove(); _modal = null; };
  modal.onclick = e => { if (e.target === modal) { modal.remove(); _modal = null; } };

  // Tab switch
  modal.querySelector('#tab-login').onclick    = () => { modal.remove(); _modal = null; showAuthModal('login', onSuccess); };
  modal.querySelector('#tab-register').onclick = () => { modal.remove(); _modal = null; showAuthModal('register', onSuccess); };

  // Magic link
  modal.querySelector('#auth-magic')?.addEventListener('click', async () => {
    const email = modal.querySelector('#auth-email').value.trim();
    if (!email) return;
    const btn = modal.querySelector('#auth-magic');
    btn.textContent = 'Sending…';
    try {
      await loginMagicLink(email);
      btn.textContent = '✓ Check your email!';
      btn.style.color = '#00FF88';
    } catch(e) {
      btn.textContent = 'Failed — try again';
      btn.style.color = '#FF4757';
    }
  });

  // Form submit
  modal.querySelector('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submit   = modal.querySelector('#auth-submit');
    const errEl    = modal.querySelector('#auth-error');
    const email    = modal.querySelector('#auth-email').value.trim();
    const password = modal.querySelector('#auth-pass').value;
    const name     = modal.querySelector('#auth-name')?.value?.trim() || '';
    const brief    = modal.querySelector('#auth-brief')?.checked ?? true;

    submit.textContent = '…';
    submit.disabled = true;
    errEl.style.display = 'none';

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password, name });
        // Set daily_brief preference
        if (!brief) await updateProfile({ daily_brief: false });
      }
      modal.remove();
      _modal = null;
      onSuccess?.(_user, _profile);
    } catch(err) {
      errEl.textContent = err.message || 'Something went wrong';
      errEl.style.display = 'block';
      submit.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      submit.disabled = false;
    }
  });

  // Focus first field
  setTimeout(() => modal.querySelector('#auth-name, #auth-email')?.focus(), 100);
}
