// ════════════════════════════════════════════════════════
//  ORBIT — Auth Manager v4
//  Calls ORBIT backend proxy instead of Supabase directly.
//  Fixes the ISO-8859-1 browser header error permanently.
//  Browser → ORBIT Railway backend → Supabase (server-side)
// ════════════════════════════════════════════════════════

// Vercel serverless functions — same domain, zero CORS issues
const API = '/api';

// Safe JSON parse — never throws on HTML/network errors
async function safeJson(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch(_) {
    // Server returned HTML (likely 404 or CORS not yet deployed)
    console.warn('[Auth] Non-JSON response:', text.slice(0, 100));
    return { ok: false, status: res.status, data: { error: 'Servidor no disponible. Inténtalo en unos segundos.' } };
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let _session = null;   // { access_token, refresh_token, expires_at, user }
let _profile = null;

export function getUser()    { return _session?.user || null; }
export function getProfile() { return _profile; }
export function isLoggedIn() { return !!_session?.access_token; }

// ── Persist session ────────────────────────────────────────────────────────────
function saveSession(s) {
  _session = s;
  if (s) localStorage.setItem('orbit_session', JSON.stringify(s));
  else   localStorage.removeItem('orbit_session');
}

// ── Init — restore from localStorage ──────────────────────────────────────────
export async function initAuth(onAuthChange) {
  try {
    const raw = localStorage.getItem('orbit_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.expires_at && parsed.expires_at * 1000 > Date.now()) {
        _session = parsed;
        await loadProfile(parsed.user?.id);
        onAuthChange?.(_session.user, _profile);
        return;
      }
      localStorage.removeItem('orbit_session');
    }
  } catch(_) {}
  onAuthChange?.(null, null);
}

async function loadProfile(userId) {
  if (!userId) return;
  try {
    const res = await fetch(`${API}/profile?id=${userId}`);
    if (res.ok) _profile = await res.json();
  } catch(_) {}
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function register({ email, password, name, daily_brief = true, email_language = 'es' }) {
  let res;
  try {
    res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, daily_brief, email_language }),
    });
  } catch(netErr) {
    throw new Error('Sin conexión. Comprueba tu internet.');
  }
  const { ok, data } = await safeJson(res);
  if (!ok) throw new Error(data.error || 'Error al crear la cuenta');
  if (data.session) {
    saveSession(data.session);
    await loadProfile(data.session.user?.id);
    // Persist email language preference to the user profile
    await updateProfile({ language: email_language }).catch(() => {});
  }
  return data;
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login({ email, password }) {
  let res;
  try {
    res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch(netErr) {
    throw new Error('Sin conexión. Comprueba tu internet.');
  }
  const { ok, data } = await safeJson(res);
  if (!ok) throw new Error(data.error || 'Email o contraseña incorrectos');
  if (data.session) {
    saveSession(data.session);
    await loadProfile(data.session.user?.id);
  }
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function logout() {
  saveSession(null);
  _profile = null;
}

// ── Update profile ────────────────────────────────────────────────────────────
export async function updateProfile(updates) {
  const userId = _session?.user?.id;
  if (!userId) return;
  try {
    const res = await fetch(`${API}/profile?id=${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) _profile = await res.json();
  } catch(_) {}
  return _profile;
}

export async function toggleDailyBrief(enabled) { return updateProfile({ daily_brief: enabled }); }

export async function loginMagicLink(email) {
  throw new Error('Magic link temporalmente no disponible. Usa email y contrasena.');
}

// Stub — no tracking without direct Supabase access in browser
export async function trackRead()     {}
export async function saveArticle()   { return false; }
export async function getSavedArticles() { return []; }

// ════════════════════════════════════════════════════════
//  AUTH MODAL
// ════════════════════════════════════════════════════════
let _modal = null;

export function showAuthModal(mode = 'login', onSuccess) {
  if (_modal) _modal.remove();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);padding:20px';

  modal.innerHTML = `
    <div style="background:#0D0D1C;border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:32px;width:100%;max-width:380px;position:relative">
      <button id="auth-close" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);width:30px;height:30px;border-radius:50%;cursor:pointer;color:rgba(255,255,255,0.5);font-size:16px;display:flex;align-items:center;justify-content:center">x</button>

      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:22px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;letter-spacing:0.2em">ORBIT</div>
      </div>

      <div style="display:flex;background:rgba(255,255,255,0.04);border-radius:10px;padding:3px;margin-bottom:22px">
        <button id="tab-login"    style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;${mode==='login'?'background:rgba(0,212,255,0.15);color:#00D4FF':'background:transparent;color:rgba(255,255,255,0.4)'}">Iniciar sesion</button>
        <button id="tab-register" style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;${mode==='register'?'background:rgba(0,212,255,0.15);color:#00D4FF':'background:transparent;color:rgba(255,255,255,0.4)'}">Crear cuenta</button>
      </div>

      <form id="auth-form" style="display:flex;flex-direction:column;gap:11px">
        ${mode==='register'?`<input id="auth-name" type="text" placeholder="Tu nombre" autocomplete="name" style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>`:''}
        <input id="auth-email" type="email" placeholder="Email" autocomplete="email" required style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>
        <input id="auth-pass" type="password" placeholder="Contrasena (min. 6 caracteres)" autocomplete="${mode==='login'?'current-password':'new-password'}" required style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;color:#fff;box-sizing:border-box;outline:none"/>
        ${mode==='register'?`<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.5)"><input id="auth-brief" type="checkbox" checked style="margin-top:2px;accent-color:#00D4FF;flex-shrink:0"/>Recibir el Daily Brief a las 20:00 con las mejores noticias del dia</label>`:''}
        ${mode==='register'?`
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,0.35);margin-bottom:7px">📧 EMAIL LANGUAGE</div>
          <div id="lang-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button type="button" class="lang-opt" data-lang="es" data-selected="true" style="padding:8px 6px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);border-radius:8px;font-size:12px;font-weight:600;color:#00D4FF;cursor:pointer">🇪🇸 Español</button>
            <button type="button" class="lang-opt" data-lang="en" style="padding:8px 6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);cursor:pointer">🇬🇧 English</button>
            <button type="button" class="lang-opt" data-lang="fr" style="padding:8px 6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);cursor:pointer">🇫🇷 Français</button>
            <button type="button" class="lang-opt" data-lang="de" style="padding:8px 6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);cursor:pointer">🇩🇪 Deutsch</button>
          </div>
        </div>`:''}
        <div id="auth-error" style="font-size:12px;color:#FF4757;display:none;padding:8px 12px;background:rgba(255,71,87,0.1);border-radius:8px;line-height:1.4"></div>
        <div id="auth-success" style="font-size:12px;color:#00FF88;display:none;padding:8px 12px;background:rgba(0,255,136,0.08);border-radius:8px;line-height:1.4"></div>
        <button type="submit" id="auth-submit" style="width:100%;padding:13px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border:none;border-radius:10px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-top:4px;font-family:inherit">
          ${mode==='login'?'Entrar':'Crear cuenta'}
        </button>
      </form>
      <p style="text-align:center;font-size:10px;color:rgba(255,255,255,0.2);margin-top:18px;line-height:1.5">Al continuar aceptas los Terminos de uso y Politica de privacidad de ORBIT.</p>
    </div>`;

  document.body.appendChild(modal);
  _modal = modal;

  modal.querySelector('#auth-close').onclick = () => { modal.remove(); _modal = null; };
  modal.onclick = e => { if (e.target === modal) { modal.remove(); _modal = null; } };
  modal.querySelector('#tab-login').onclick    = () => { modal.remove(); _modal = null; showAuthModal('login', onSuccess); };
  modal.querySelector('#tab-register').onclick = () => { modal.remove(); _modal = null; showAuthModal('register', onSuccess); };

  modal.querySelectorAll('.lang-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.lang-opt').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.color = 'rgba(255,255,255,0.5)';
        delete b.dataset.selected;
      });
      btn.style.background = 'rgba(0,212,255,0.15)';
      btn.style.borderColor = 'rgba(0,212,255,0.4)';
      btn.style.color = '#00D4FF';
      btn.dataset.selected = 'true';
    });
  });

  modal.querySelector('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submit   = modal.querySelector('#auth-submit');
    const errEl    = modal.querySelector('#auth-error');
    const succEl   = modal.querySelector('#auth-success');
    const email     = modal.querySelector('#auth-email').value.trim();
    const password  = modal.querySelector('#auth-pass').value;
    const name      = modal.querySelector('#auth-name')?.value?.trim() || '';
    const brief     = modal.querySelector('#auth-brief')?.checked ?? true;
    const emailLang = modal.querySelector('.lang-opt[data-selected]')?.dataset.lang || 'es';

    submit.textContent = '...'; submit.disabled = true;
    errEl.style.display = 'none'; succEl.style.display = 'none';

    try {
      let result;
      if (mode === 'login') {
        result = await login({ email, password });
      } else {
        result = await register({ email, password, name, daily_brief: brief, email_language: emailLang });
      }

      // Show success if requires manual login (email confirmation was disabled)
      if (result.requiresLogin) {
        succEl.textContent = result.message || 'Cuenta creada. Inicia sesion.';
        succEl.style.display = 'block';
        submit.textContent = 'Entrar';
        submit.disabled = false;
        // Switch to login tab
        setTimeout(() => { modal.remove(); _modal = null; showAuthModal('login', onSuccess); }, 1500);
        return;
      }

      modal.remove(); _modal = null;
      onSuccess?.(_session?.user, _profile);
    } catch(err) {
      let msg = err.message || 'Algo salio mal';
      if (msg.includes('invalid_credentials') || msg.includes('Invalid login')) msg = 'Email o contrasena incorrectos';
      if (msg.includes('already') || msg.includes('duplicate')) msg = 'Ya existe una cuenta con este email. Inicia sesion.';
      if (msg.includes('6 character') || msg.includes('should be')) msg = 'La contrasena debe tener al menos 6 caracteres';
      errEl.textContent = msg;
      errEl.style.display = 'block';
      submit.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta';
      submit.disabled = false;
    }
  });

  setTimeout(() => modal.querySelector('#auth-name, #auth-email')?.focus(), 100);
}
