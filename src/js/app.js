// ════════════════════════════════════════════════════════
//  ORBIT — Main Application v7 REALTIME
//  Architecture: SSE streaming from backend
//  Planet → Country → Category → Living Stories
// ════════════════════════════════════════════════════════
import { Globe }            from './Globe.js';
import { UIManager }        from './UIManager.js';
import { CATEGORIES, COUNTRY_FLAGS } from './data.js';
import { translateNews }    from './TranslationService.js';
import { processFeed }      from './ProcessingPipeline.js';
import { applyAll, getLang } from './i18n.js';
import { RealtimeEngine }   from './RealtimeEngine.js';

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

    const avgIntensity = Math.min(
      articles.reduce((s, a) => s + (a.intensity || 0.5), 0) / articles.length * 1.3,
      1.0
    );
    const catCounts = {};
    articles.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
    const domCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'world';
    const cat    = CATEGORIES[domCat] || CATEGORIES.world;

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
    }, cat.color);
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
    if (el) el.textContent = counts[cat] || 0;
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
  spawnHotspots(news);
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

  progress(0.05, 'Initializing globe…');
  initCapacitor().catch(() => {});

  const canvas = document.getElementById('globe-canvas');
  _globe = new Globe(canvas);
  _globe.callbacks.onLoadProgress = p => progress(p * 0.55 + 0.05);

  await new Promise(resolve => {
    _globe.callbacks.onReady = resolve;
    setTimeout(resolve, 8000);
  });

  progress(0.65, 'Connecting to ORBIT engine…');

  // Init UI
  _ui = new UIManager(_globe);
  _ui.getLiveNews = () => _liveNews;

  _globe.callbacks.onHotspotHover    = (d, x, y) => _ui.onHotspotHover(d, x, y);
  _globe.callbacks.onHotspotLeave    = ()         => _ui.onHotspotLeave();
  _globe.callbacks.onHotspotClick    = d          => _ui.onCountryHubClick(d);
  _globe.callbacks.onBackgroundClick = ()         => _ui.closePanel();

  applyAll();

  // Sidebar category filter
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      _globe.filterByCategory(item.dataset.category || 'all');
    });
  });

  // ── Connect to ORBIT Realtime Engine ──────────────────────────────────────
  progress(0.75, 'Connecting to live stream…');

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
      _globe.flyTo(20, 10, 3.8, 2000);
    },

    // Called whenever server pushes new stories (every ~90 seconds)
    onUpdate: async (newStories) => {
      console.log(`[App] Live update: +${newStories.length} stories`);
      await mergeNewStories(newStories);
    },

    // Connection error — show offline mode
    onError: () => {
      const liveEl = document.querySelector('.sidebar-live span');
      if (liveEl) liveEl.textContent = 'Reconnecting…';
    },
  });

  _realtime.start();

  // Safety net: if SSE doesn't init within 15 seconds, fall back to direct fetch
  setTimeout(async () => {
    if (_liveNewsRaw.length === 0) {
      console.warn('[App] SSE timeout, fetching directly from API…');
      try {
        const res = await fetch(`${_realtime.getServerUrl()}/api/stories`);
        if (res.ok) {
          const data = await res.json();
          _liveNewsRaw = data.stories || [];
          await displayNews(_liveNewsRaw);
        }
      } catch(e) {
        console.warn('[App] Direct API fetch failed:', e.message);
        // Use ProcessingPipeline micro-stories as last resort
        const { ensureDensity } = await import('./ProcessingPipeline.js');
        _liveNewsRaw = ensureDensity([]);
        await displayNews(_liveNewsRaw);
      } finally {
        screen.style.opacity = '0';
        setTimeout(() => screen.classList.add('hidden'), 500);
        app.classList.remove('hidden');
        _globe.flyTo(20, 10, 3.8, 2000);
      }
    }
  }, 15_000);

  // Onboarding
  document.querySelectorAll('.ob-cat').forEach(b => b.addEventListener('click', () => b.classList.toggle('selected')));
  document.getElementById('ob-next-1')?.addEventListener('click', () => showStep(2));
  document.getElementById('ob-next-2')?.addEventListener('click', () => showStep(3));
  document.getElementById('ob-next-3')?.addEventListener('click', () => showStep(4));
  document.getElementById('ob-launch')?.addEventListener('click', launchApp);
  document.getElementById('ob-skip')?.addEventListener('click',   launchApp);
  if (!localStorage.getItem(FIRST_VISIT)) {
    document.getElementById('onboarding').classList.remove('hidden');
    showStep(1);
  }

  // Language change → re-translate displayed news
  window.addEventListener('orbit:lang', async () => {
    if (_liveNewsRaw.length) await displayNews(_liveNewsRaw);
  });
}

boot().catch(err => console.error('[ORBIT boot]', err));
