// ════════════════════════════════════════════════════════
//  ORBIT — Main Application v7 REALTIME
//  Architecture: SSE streaming from backend
//  Planet → Country → Category → Living Stories
// ════════════════════════════════════════════════════════
import { Globe }            from './Globe.js';
import { UIManager }        from './UIManager.js';
import { CATEGORIES, COUNTRY_FLAGS } from './data.js';
import { translateNews }    from './TranslationService.js';
import { applyAll, getLang } from './i18n.js';
import { RealtimeEngine }   from './RealtimeEngine.js';
import { initAuth, isLoggedIn, getUser, getProfile, register, login } from './AuthManager.js';
import { openOrbitPlus } from './OrbitPlus.js';
import { VERSION, CHANGELOG, shouldShowChangelog, markChangelogSeen } from './version.js';
import { detect as chronosDetect, recordSignal }  from './ChronosEngine.js';
import { adaptFeedToTime, activityLevel }          from './TimeContextEngine.js';
import { AmbientCanvas }                           from './AmbientCanvas.js';

// ─── Capacitor ────────────────────────────────────────────────────────────────
const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor;
const isAndroid   = isCapacitor && window.Capacitor?.getPlatform?.() === 'android';
const isIOS       = isCapacitor && window.Capacitor?.getPlatform?.() === 'ios';
if (isAndroid) document.documentElement.classList.add('capacitor-android');
if (isIOS)     document.documentElement.classList.add('capacitor-ios');

async function initCapacitor() {
  if (!isCapacitor) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#07070F' });
    if (isAndroid) await StatusBar.setOverlaysWebView({ overlay: true });
  } catch(_) {}
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 500 });
  } catch(_) {}
}

// ─── Country centroids ────────────────────────────────────────────────────────
const CENTROIDS = {
  UK:{lat:52.5,lng:-1.8},US:{lat:39.5,lng:-98.4},ES:{lat:40.0,lng:-4.0},
  FR:{lat:46.2,lng:2.2},DE:{lat:51.2,lng:10.5},JP:{lat:36.2,lng:138.2},
  CN:{lat:35.0,lng:105.0},BR:{lat:-14.2,lng:-51.9},IN:{lat:20.6,lng:79.0},
  KR:{lat:35.9,lng:127.8},AU:{lat:-25.3,lng:133.8},RU:{lat:61.5,lng:90.0},
  CA:{lat:56.1,lng:-106.3},MX:{lat:23.6,lng:-102.5},AR:{lat:-38.4,lng:-63.6},
  IT:{lat:42.5,lng:12.6},SA:{lat:23.9,lng:45.1},AE:{lat:23.5,lng:53.8},
  NG:{lat:9.1,lng:8.7},ZA:{lat:-28.5,lng:24.7},UA:{lat:48.4,lng:31.2},
  TR:{lat:38.9,lng:35.2},ID:{lat:-2.5,lng:118.0},SG:{lat:1.3,lng:103.8},
  PL:{lat:51.9,lng:19.1},NL:{lat:52.1,lng:5.3},SE:{lat:60.1,lng:18.6},
  PT:{lat:39.6,lng:-8.2},IL:{lat:31.5,lng:34.8},PK:{lat:30.4,lng:69.3},
  EG:{lat:26.8,lng:30.8},TH:{lat:15.9,lng:100.9},MY:{lat:4.2,lng:109.0},
  VN:{lat:16.2,lng:107.8},CO:{lat:4.6,lng:-74.3},CL:{lat:-35.7,lng:-71.5},
  BE:{lat:50.5,lng:4.5},AT:{lat:47.5,lng:14.5},GR:{lat:39.1,lng:21.8},
  PH:{lat:12.9,lng:121.8},BD:{lat:23.7,lng:90.4},ET:{lat:8.6,lng:39.6},
  GH:{lat:7.9,lng:-1.0},MA:{lat:31.8,lng:-7.1},
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
const FIRST_VISIT = 'orbit_v1';
let _step = 1;
function showStep(s) {
  document.querySelectorAll('.ob-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i + 1 === s));
  document.querySelector(`.ob-step[data-step="${s}"]`)?.classList.add('active');
  _step = s;
}
function launchApp() {
  const ob = document.getElementById('onboarding');
  ob.style.transition = 'opacity .6s ease'; ob.style.opacity = '0';
  setTimeout(() => ob.classList.add('hidden'), 600);
  localStorage.setItem(FIRST_VISIT, '1');
}

// ─── Global state ─────────────────────────────────────────────────────────────
let _globe       = null;
let _authResolve = null;
let _chronosSlot = 'morning'; // updated after chronos detect

// ─── Auth wall setup ──────────────────────────────────────────────────────────
function _waitForAuth() {
  return new Promise(resolve => { _authResolve = resolve; });
}

function _showAuthWall() {
  const aw = document.getElementById('auth-wall');
  if (aw) aw.classList.remove('hidden');
}

function _hideAuthWall() {
  const aw = document.getElementById('auth-wall');
  if (!aw) return;
  aw.classList.add('fade-out');
  // Reveal loading screen underneath the fading auth wall
  document.getElementById('loading-screen')?.classList.remove('hidden');
  setTimeout(() => aw.classList.add('hidden'), 700);
}

function _initAuthWall() {
  const wall   = document.getElementById('auth-wall');
  if (!wall) return;
  wall.classList.remove('hidden');

  const form    = document.getElementById('aw-form');
  const tabs    = wall.querySelectorAll('.aw-tab');
  const nameIn  = document.getElementById('aw-name');
  const briefRow= document.getElementById('aw-brief-row');
  const langRow = document.getElementById('aw-lang-row');
  const submit  = document.getElementById('aw-submit');
  const submitTxt = document.getElementById('aw-submit-text');
  const errEl   = document.getElementById('aw-error');
  const succEl  = document.getElementById('aw-success');
  let mode = 'register';

  function setMode(m) {
    mode = m;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === m));
    if (m === 'login') {
      nameIn?.classList.add('hidden');
      briefRow?.classList.add('hidden');
      if (langRow) langRow.style.display = 'none';
      submitTxt.textContent = 'Entrar';
      document.getElementById('aw-pass').setAttribute('autocomplete','current-password');
    } else {
      nameIn?.classList.remove('hidden');
      briefRow?.classList.remove('hidden');
      if (langRow) langRow.style.display = '';
      submitTxt.textContent = 'Crear cuenta gratis';
      document.getElementById('aw-pass').setAttribute('autocomplete','new-password');
    }
    errEl.classList.add('hidden');
    succEl.classList.add('hidden');
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.tab)));

  wall.querySelectorAll('.aw-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wall.querySelectorAll('.aw-lang-btn').forEach(b => delete b.dataset.selected);
      btn.dataset.selected = 'true';
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('aw-email').value.trim();
    const password = document.getElementById('aw-pass').value;
    const name      = document.getElementById('aw-name')?.value?.trim() || '';
    const brief     = document.getElementById('aw-brief')?.checked ?? true;
    const emailLang = wall.querySelector('.aw-lang-btn[data-selected]')?.dataset.lang || 'es';

    submit.disabled = true;
    submitTxt.textContent = '...';
    errEl.classList.add('hidden');
    succEl.classList.add('hidden');

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        const result = await register({ email, password, name, daily_brief: brief, email_language: emailLang });
        if (result.requiresLogin) {
          succEl.textContent = 'Cuenta creada. Inicia sesión.';
          succEl.classList.remove('hidden');
          setMode('login');
          submit.disabled = false;
          return;
        }
      }
      // Success — update avatar and proceed to app
      const user = getUser();
      const av   = document.querySelector('.avatar');
      if (av && user) av.textContent = (getProfile()?.name || user.email || 'U').charAt(0).toUpperCase();
      _hideAuthWall();
      if (_authResolve) { _authResolve(); _authResolve = null; }
    } catch(err) {
      let msg = err.message || 'Algo salió mal';
      if (msg.includes('invalid_credentials') || msg.includes('Invalid login')) msg = 'Email o contraseña incorrectos';
      if (msg.includes('already') || msg.includes('duplicate')) msg = 'Ya tienes cuenta. Inicia sesión.';
      if (msg.includes('6 char') || msg.includes('should be')) msg = 'La contraseña debe tener al menos 6 caracteres';
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
      submitTxt.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta gratis';
      submit.disabled = false;
    }
  });
}
let _ui          = null;
let _liveNewsRaw = [];   // Original from server
let _liveNews    = [];   // After translation (display)
let _realtime    = null;

function jt(v, r = 0.3) { return v + (Math.random() - 0.5) * r; }

// ─── Spawn hotspots: ONE per country ─────────────────────────────────────────
function spawnHotspots(news, animate = false) {
  _globe.removeAllHotspots();

  const byCountry = new Map();
  news.forEach(n => {
    if (!byCountry.has(n.country)) byCountry.set(n.country, []);
    byCountry.get(n.country).push(n);
  });

  byCountry.forEach((articles, country) => {
    const centroid = CENTROIDS[country];
    if (!centroid) return;

    // Use real articles for intensity/color — micro-stories are filler, not signals
    const realArticles = articles.filter(a => !a.isMicro);
    const forIntensity = realArticles.length > 0 ? realArticles : articles;

    const avgIntensity = Math.min(
      forIntensity.reduce((s, a) => s + (a.intensity || 0.5), 0) / forIntensity.length * 1.3,
      1.0
    );
    const catCounts = {};
    forIntensity.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
    const domCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'world';

    // Color: most countries stay cyan, only genuinely viral ones change
    const hotColor =
      avgIntensity > 0.88 ? '#FF8C35' :   // breaking — orange (rare)
      avgIntensity > 0.76 ? '#A855F7' :   // significant — purple
                            '#00D4FF';     // normal — ORBIT cyan

    _globe.addHotspot({
      id:       `hub-${country}`,
      country,
      category: domCat,
      lat:      jt(centroid.lat, 0.2),
      lng:      jt(centroid.lng, 0.2),
      intensity: avgIntensity,
      title:    `${country} — ${articles.length} stories`,
      summary:  articles[0]?.title || '',
      _allNews: articles,
      _isHub:   true,
    }, hotColor);
  });

  _liveNews = news;
  updateCounts(news);
  const active = document.querySelector('.sidebar-item.active');
  if (active) _globe.filterByCategory(active.dataset.category || 'all');
}

function updateCounts(news) {
  const counts = {};
  news.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });
  const allEl = document.getElementById('cnt-all');
  if (allEl) allEl.textContent = news.length;
  Object.keys(CATEGORIES).forEach(cat => {
    if (cat === 'all') return;
    const el = document.getElementById(`cnt-${cat}`);
    if (!el) return;
    if (cat === 'trending') {
      // Count top-trending articles (trendScore > 0.6) across all categories
      const hotCount = news.filter(n => (n.trendScore || n.intensity || 0) > 0.6).length;
      el.textContent = hotCount || '—';
    } else {
      el.textContent = counts[cat] || 0;
    }
  });
  const liveEl = document.querySelector('.sidebar-live span');
  if (liveEl) liveEl.textContent = `${news.length} live stories`;
}

// ─── Translation ──────────────────────────────────────────────────────────────
async function applyTranslation(news, lang) {
  if (lang === 'en') return news;
  try {
    const toTranslate = news.filter(n => (n.lang || 'en') !== lang);
    const keeps       = news.filter(n => (n.lang || 'en') === lang);
    const translated  = toTranslate.length ? await translateNews(toTranslate, lang) : [];
    return [...translated, ...keeps];
  } catch(_) { return news; }
}

async function displayNews(rawNews) {
  const lang = getLang();
  const news = lang !== 'en' ? await applyTranslation(rawNews, lang) : rawNews;
  // Apply time-context re-ranking before spawning hotspots
  const timeAdapted = adaptFeedToTime(news, _chronosSlot);
  spawnHotspots(timeAdapted);
}

// ─── Merge new stories into existing pool ────────────────────────────────────
async function mergeNewStories(newStories) {
  if (!newStories.length) return;

  // Add to raw pool (dedup by id)
  const existingIds = new Set(_liveNewsRaw.map(n => n.id));
  const fresh = newStories.filter(n => !existingIds.has(n.id));
  if (!fresh.length) return;

  _liveNewsRaw = [...fresh, ..._liveNewsRaw].slice(0, 800); // Keep max 800
  await displayNews(_liveNewsRaw);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function boot() {
  const bar    = document.getElementById('loading-bar');
  const label  = document.getElementById('loading-label');
  const screen = document.getElementById('loading-screen');
  const app    = document.getElementById('app');

  const progress = (p, msg) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    if (msg && label) label.textContent = msg;
  };

  // ── Auth gate — must log in before globe loads ───────────────────────────────
  await initAuth(() => {});
  if (!isLoggedIn()) {
    _initAuthWall();
    await _waitForAuth();
  } else {
    const aw = document.getElementById('auth-wall');
    if (aw) aw.classList.add('hidden');
    screen.classList.remove('hidden');
  }

  // Update avatar — priority: profile name > auth metadata name > email prefix
  const _user = getUser();
  const _prof = getProfile();
  if (_user) {
    const metaName  = _user.user_metadata?.name || '';
    const savedName = (_prof?.name && _prof.name !== 'World Explorer') ? _prof.name : '';
    const name = savedName || metaName || _user.email?.split('@')[0] || 'U';
    const av   = document.querySelector('.avatar');
    if (av) av.textContent = name.charAt(0).toUpperCase();
    document.getElementById('btn-profile')?.setAttribute('title', name);
    // Auto-seed profile with registration name if not yet saved
    if (metaName && !savedName) {
      const { saveProfile } = await import('./PersonalizationService.js');
      saveProfile({ name: metaName });
    }
  }

  // ── Chronos — detect time context before globe loads ─────────────────────
  const _chronos = chronosDetect();
  _chronosSlot   = _chronos.slotKey;
  const _activity = activityLevel(_chronos.hour);
  // Drive ambient background intensity via CSS var
  document.documentElement.style.setProperty('--activity', String(_activity));

  // Start ambient particle canvas
  const _ambientEl = document.getElementById('ambient-canvas');
  let _ambient = null;
  if (_ambientEl) {
    _ambient = new AmbientCanvas(_ambientEl);
    _ambient.setActivity(_activity);
    _ambient.start();
  }
  console.log(`[Chronos] Slot: ${_chronos.slotKey} · Activity: ${(_activity*100).toFixed(0)}% · Spawn: ${_chronos.spawnLat.toFixed(1)}, ${_chronos.spawnLng.toFixed(1)}`);

  progress(0.05, 'Initializing globe…');
  initCapacitor().catch(() => {});

  const canvas = document.getElementById('globe-canvas');
  _globe = new Globe(canvas);
  _globe.callbacks.onLoadProgress = p => progress(p * 0.55 + 0.05);

  await new Promise(resolve => {
    _globe.callbacks.onReady = resolve;
    setTimeout(resolve, 6000); // 6s max — feel faster
  });

  progress(0.65, 'Iniciando inteligencia global…');

  // Init UI
  _ui = new UIManager(_globe);
  _ui.getLiveNews = () => _liveNews;

  _globe.callbacks.onHotspotHover    = (d, x, y) => _ui.onHotspotHover(d, x, y);
  _globe.callbacks.onHotspotLeave    = ()         => _ui.onHotspotLeave();
  _globe.callbacks.onHotspotClick    = d          => _ui.onCountryHubClick(d);
  _globe.callbacks.onBackgroundClick = ()         => _ui.closePanel();

  applyAll();

  // ── Connect to ORBIT Realtime Engine ──────────────────────────────────────
  progress(0.75, 'Sincronizando con 800+ fuentes globales…');

  _realtime = new RealtimeEngine({
    globe: _globe,

    // Called once on first connection with full story set
    onInit: async (stories, stats) => {
      console.log(`[App] Init: ${stories.length} stories from server`);
      progress(0.90, `Loading ${stories.length} live stories…`);
      _liveNewsRaw = stories;
      await displayNews(_liveNewsRaw);
      progress(1.0);

      // Reveal app
      screen.style.transition = 'opacity .5s ease';
      screen.style.opacity = '0';
      setTimeout(() => screen.classList.add('hidden'), 500);
      app.classList.remove('hidden');

      // Re-fire resize so renderer matches actual post-auth viewport
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);

      // Refresh trending bar with real topics from loaded news
      setTimeout(() => _ui?.refreshTrending(), 800);

      // Cinematic Chronos spawn — fly in from space to time-context position
      setTimeout(() => {
        _globe.flyFromSpace(_chronos.spawnLat, _chronos.spawnLng, 4.0, 3200);
        setTimeout(() => _globe.pulseCategories(_chronos.categories, 2500), 2000);
      }, 600);
    },

    // Called whenever server pushes new stories (every ~90 seconds)
    onUpdate: async (newStories) => {
      console.log(`[App] Live update: +${newStories.length} stories`);
      await mergeNewStories(newStories);
      // Refresh trending bar with updated news pool
      _ui?.refreshTrending();
      // Ambient pulse on live update (no color change — always blue)
      if (_ambient) _ambient.setActivity(_activity);
    },

    // Connection error — show offline mode
    onError: () => {
      const liveEl = document.querySelector('.sidebar-live span');
      if (liveEl) liveEl.textContent = 'Reconnecting…';
    },
  });

  _realtime.start();

  // ── FAST PATH: REST API immediately (don't wait for SSE) ─────────────────
  // SSE can take 5-15 seconds. REST responds in 1-3 seconds.
  // Show content instantly via REST, SSE upgrades in background.
  (async () => {
    try {
      const res = await fetch(`${_realtime.getServerUrl()}/api/stories`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok && _liveNewsRaw.length === 0) {
        const data = await res.json();
        const stories = data.stories || [];
        if (stories.length > 0) {
          console.log(`[App] Fast REST load: ${stories.length} stories`);
          _liveNewsRaw = stories;
          await displayNews(_liveNewsRaw);
          progress(1.0);
          // Reveal app immediately
          screen.style.transition = 'opacity .5s ease';
          screen.style.opacity = '0';
          setTimeout(() => screen.classList.add('hidden'), 500);
          app.classList.remove('hidden');
          setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
          setTimeout(() => {
            _globe.flyFromSpace(_chronos.spawnLat, _chronos.spawnLng, 4.0, 3200);
            setTimeout(() => _globe.pulseCategories(_chronos.categories, 2500), 2000);
          }, 600);
          setTimeout(() => _ui?.refreshTrending(), 800);
        }
      }
    } catch(_) { /* SSE will handle it */ }
  })();

  // SSE safety net: if neither REST nor SSE worked in 12 seconds
  setTimeout(async () => {
    if (_liveNewsRaw.length === 0) {
      console.warn('[App] All sources timeout, using fallback…');
      try {
        const { ensureDensity } = await import('./ProcessingPipeline.js');
        _liveNewsRaw = ensureDensity([]);
        await displayNews(_liveNewsRaw);
      } finally {
        screen.style.opacity = '0';
        setTimeout(() => screen.classList.add('hidden'), 500);
        app.classList.remove('hidden');
        _globe.flyFromSpace(_chronos.spawnLat, _chronos.spawnLng, 4.0, 3200);
      }
    }
  }, 12_000);

  // Onboarding
  document.querySelectorAll('.ob-cat').forEach(b => b.addEventListener('click', () => b.classList.toggle('selected')));
  document.getElementById('ob-next-1')?.addEventListener('click', () => showStep(2));
  document.getElementById('ob-next-2')?.addEventListener('click', () => showStep(3));
  document.getElementById('ob-next-3')?.addEventListener('click', () => showStep(4));
  document.getElementById('ob-launch')?.addEventListener('click', launchApp);
  document.getElementById('ob-skip')?.addEventListener('click',   launchApp);

  // ORBIT+ topbar button
  document.getElementById('btn-orbit-plus')?.addEventListener('click', () => openOrbitPlus('topbar'));

  // Set version in sidebar badge
  const svbNum = document.getElementById('svb-num');
  if (svbNum) svbNum.textContent = 'v' + VERSION;

  // Language change → re-translate displayed news
  window.addEventListener('orbit:lang', async () => {
    if (_liveNewsRaw.length) await displayNews(_liveNewsRaw);
  });
}

function _showChangelog() {
  const latest = CHANGELOG[0];
  if (!latest) return;

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:800;max-width:320px;animation:panel-drop .3s ease';
  modal.innerHTML = `
    <div style="background:rgba(8,8,22,.97);border:1px solid rgba(0,212,255,.25);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 1px rgba(0,212,255,.08)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px">${latest.emoji}</span>
          <div>
            <div style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;color:#fff">${latest.title}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:1px">v${latest.version} · ${latest.date}</div>
          </div>
        </div>
        <button id="cl-close" style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px">
        ${latest.items.map(item => `
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.5">
            <span style="color:#00D4FF;flex-shrink:0;margin-top:1px">✓</span>
            <span>${String(item).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</span>
          </li>
        `).join('')}
      </ul>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);font-size:10px;color:rgba(255,255,255,.25);text-align:center">
        ORBIT ${VERSION} · orbit-news.vercel.app
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  markChangelogSeen();

  modal.querySelector('#cl-close').onclick = () => modal.remove();
  setTimeout(() => modal.remove(), 12000); // auto-dismiss after 12s
}

boot().catch(err => console.error('[ORBIT boot]', err));
