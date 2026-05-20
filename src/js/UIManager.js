// ════════════════════════════════════════════════════════
//  ORBIT — UI Manager v4
//  Cards: solid dark bg, engagement system, favorites, notifications
// ════════════════════════════════════════════════════════
import { NEWS_DATA, CATEGORIES, COUNTRY_FLAGS } from './data.js';
import { getTrendingTopics }                     from './data.js';
import { t, applyAll, getLang, setLang, SUPPORTED } from './i18n.js';
import { translateNews }                           from './TranslationService.js';
import {
  getProfile, saveProfile, markRead, isRead,
  getStats, getPersonalizedFeed,
} from './PersonalizationService.js';

// ─── Engagement store ─────────────────────────────────────────────────────────
// X-style: users like/pass articles → drives "Trending" and "For You" ordering
const ENG_KEY = 'orbit_engagement_v1';
let _eng = {};
try { _eng = JSON.parse(localStorage.getItem(ENG_KEY) || '{}'); } catch(_) {}

function saveEng() {
  try { localStorage.setItem(ENG_KEY, JSON.stringify(_eng)); } catch(_) {}
}

function likeArticle(id)   { _eng[id] = (_eng[id] || 0) + 2; saveEng(); }
function passArticle(id)   { _eng[id] = (_eng[id] || 0) - 1; saveEng(); }
function getEngScore(id)   { return _eng[id] || 0; }

// ─── Favorites store ──────────────────────────────────────────────────────────
const FAV_KEY = 'orbit_favorites_v1';
let _favs = new Set();
try { _favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch(_) {}

function toggleFavorite(cat)  { _favs.has(cat) ? _favs.delete(cat) : _favs.add(cat); localStorage.setItem(FAV_KEY, JSON.stringify([..._favs])); }
function isFavorite(cat)      { return _favs.has(cat); }
function getFavorites()       { return [..._favs]; }

// ─── Daily notification at 20:00 ─────────────────────────────────────────────
function scheduleDailyBrief(getLiveNews) {
  if (!('Notification' in window)) return;

  const fire = () => {
    const pool  = getLiveNews();
    const favs  = getFavorites();
    const items = pool
      .filter(n => favs.length === 0 || favs.includes(n.category))
      .sort((a, b) => ((getEngScore(b.id) + b.intensity) - (getEngScore(a.id) + a.intensity)))
      .slice(0, 3);

    if (!items.length) return;

    const body = items.map((n, i) => `${i + 1}. ${n.title.slice(0, 80)}`).join('\n');
    try {
      new Notification('◎ ORBIT — Daily Brief', {
        body,
        icon: '/icon.png',
        tag: 'orbit-daily',
      });
    } catch(_) {}
  };

  const schedule = () => {
    const now    = new Date();
    const target = new Date(now);
    target.setHours(20, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target - now;
    setTimeout(() => { fire(); schedule(); }, delay);
  };

  Notification.requestPermission().then(perm => {
    if (perm === 'granted') schedule();
  });
}

// HTML-escape
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════════
export class UIManager {
  constructor(globe) {
    this.globe = globe;
    this._activeCategory   = 'all';
    this._panelOpen        = false;
    this._currentNews      = [];
    this._countryNewsPool  = [];
    this._searchTimeout    = null;
    this._translateTimeout = null;
    this.getLiveNews = null;

    this._bindElements();
    this._initSidebar();
    this._initTrending();
    this._initSearch();
    this._initPanelTabs();
    this._initPanelClose();
    this._initGlobeControls();
    this._initAIBrief();
    this._initProfile();
    this._initProfileScreen();
    this._initArticleModal();
    this._initLangSelector();
    this._initMobileLang();
    this._startWorldClock();

    applyAll();
  }

  // ── Element refs ───────────────────────────────────────────────────────────
  _bindElements() {
    this.newsPanel      = document.getElementById('news-panel');
    this.cardsContainer = document.getElementById('news-cards-container');
    this.panelCountry   = document.getElementById('panel-country');
    this.panelFlag      = document.getElementById('panel-flag');
    this.panelSubtitle  = document.getElementById('panel-subtitle');
    this.tooltip        = document.getElementById('country-tooltip');
    this.tooltipFlag    = document.getElementById('tooltip-flag');
    this.tooltipName    = document.getElementById('tooltip-name');
    this.aiPanel        = document.getElementById('ai-panel');
    this.profilePanel   = document.getElementById('profile-panel');
    this.articleModal   = document.getElementById('article-modal');
    this.articleBody    = document.getElementById('article-body');
  }

  // ── Language selector ──────────────────────────────────────────────────────
  _initLangSelector() {
    const btn      = document.getElementById('btn-lang');
    const dropdown = document.getElementById('lang-dropdown');
    if (!btn || !dropdown) return;
    this._updateLangBtn();
    this._renderLangOptions(dropdown);
    btn.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.toggle('visible'); });
    document.addEventListener('click', () => dropdown.classList.remove('visible'));
    window.addEventListener('orbit:lang', () => {
      applyAll();
      this._updateLangBtn();
      if (this._panelOpen) this._renderCards(this._currentNews);
      const ap = document.getElementById('ai-panel');
      if (ap && !ap.classList.contains('hidden')) document.getElementById('ai-panel-content').innerHTML = this._renderBrief();
    });
  }

  _initMobileLang() {
    // Mobile lang bar removed — language is controlled only via topbar button.
    // Keeping stub for backwards compatibility.
  }

  _renderLangOptions(dropdown) {
    dropdown.innerHTML = Object.entries(SUPPORTED).map(([code, info]) => `
      <button class="lang-option ${getLang() === code ? 'active' : ''}" data-lang="${code}">
        <span>${info.flag}</span><span>${info.name}</span>
      </button>
    `).join('');
    dropdown.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        setLang(opt.dataset.lang);
        dropdown.classList.remove('visible');
        dropdown.querySelectorAll('.lang-option').forEach(o =>
          o.classList.toggle('active', o.dataset.lang === opt.dataset.lang)
        );
      });
    });
  }

  _updateLangBtn() {
    const btn = document.getElementById('btn-lang');
    if (!btn) return;
    const info = SUPPORTED[getLang()];
    btn.innerHTML = `<span style="font-size:17px">${info.flag}</span><span style="font-size:11px;font-weight:700">${info.label}</span>`;
  }

  // ── Sidebar with FAVORITES star ────────────────────────────────────────────
  _initSidebar() {
    const items = document.querySelectorAll('.sidebar-item, .mobile-cat');
    items.forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.mobile-cat').forEach(i => i.classList.remove('active'));
        document.querySelectorAll(`[data-category="${item.dataset.category}"]`).forEach(i => i.classList.add('active'));
        const cat = item.dataset.category || 'all';
        this._activeCategory = cat;
        this.globe.filterByCategory(cat);
        if (this._panelOpen && this._countryNewsPool.length) {
          let filtered = cat === 'all' ? this._countryNewsPool : this._countryNewsPool.filter(n => n.category === cat);
          if (!filtered.length) filtered = this._countryNewsPool;
          this._currentNews = filtered;
          this._renderCards(filtered);
        }
      });
    });

    // Add favorite star to each sidebar item
    document.querySelectorAll('.sidebar-item').forEach(item => {
      const cat = item.dataset.category;
      if (!cat || cat === 'all') return;
      const star = document.createElement('button');
      star.title = 'Add to Favorites';
      star.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:0 0 0 4px;opacity:0.5;flex-shrink:0';
      star.textContent = isFavorite(cat) ? '⭐' : '☆';
      star.addEventListener('click', e => {
        e.stopPropagation();
        toggleFavorite(cat);
        star.textContent = isFavorite(cat) ? '⭐' : '☆';
        star.style.opacity = isFavorite(cat) ? '1' : '0.5';
      });
      item.appendChild(star);
    });
  }

  _pool() { return this.getLiveNews ? this.getLiveNews() : NEWS_DATA; }

  // ── Panel ──────────────────────────────────────────────────────────────────
  openPanel(displayItems, allCountryItems, title, subtitle, flag) {
    this._currentNews     = displayItems;
    this._countryNewsPool = allCountryItems;
    this.panelCountry.textContent  = title;
    this.panelSubtitle.textContent = subtitle;
    this.panelFlag.textContent     = flag || '🌍';
    this.hideTooltip();
    this._renderCards(displayItems);
    this.newsPanel.classList.add('open');
    this._panelOpen = true;

    // Auto-translate titles to current language
    const lang = getLang();
    if (lang !== 'en') {
      clearTimeout(this._translateTimeout);
      this._translateTimeout = setTimeout(() => this._translateAndRender(displayItems, lang), 600);
    }
  }

  async _translateAndRender(items, lang) {
    try {
      const translated = await translateNews(items, lang);
      if (this._panelOpen && translated.length) this._renderCards(translated);
    } catch(_) {}
  }

  closePanel() {
    this.newsPanel.classList.remove('open');
    this._panelOpen = false;
    this._countryNewsPool = [];
    this.globe.clearHighlight?.();
    if (this.globe._isZoomedIn) this.globe.resetView();
  }

  // ── Card rendering — DEFINITIVE FIX ──────────────────────────────────────
  // Method: CSS class .orbit-card-headline + setProperty('color','#ffffff','important')
  // The !important inline property CANNOT be overridden by any stylesheet.
  // This is the nuclear option that will ALWAYS show the title.
  _renderCards(newsItems) {
    const profile = getProfile();

    this.cardsContainer.innerHTML = '';

    if (!newsItems || !newsItems.length) {
      this.cardsContainer.innerHTML = `
        <div style="padding:32px;text-align:center;font-size:14px;color:rgba(255,255,255,0.4)">
          ${esc(t('no_stories') || 'No stories found')}
        </div>`;
      return;
    }

    // Sort by engagement + personalization score
    const scored = [...newsItems]
      .map(n => ({ ...n, _total: (n.intensity || 0.5) * 40 + getEngScore(n.id) * 20 + (profile.categories.includes(n.category) ? 15 : 0) + (profile.followedCountries.includes(n.country) ? 20 : 0) }))
      .sort((a, b) => b._total - a._total);

    scored.forEach((n, i) => {
      const cat      = CATEGORIES[n.category] || CATEGORIES.all;
      const catLabel = t('cat_' + n.category) || cat.label;
      const rising   = n.trend === 'rising';
      const engScore = getEngScore(n.id);
      const liked    = engScore > 0;
      const passed   = engScore < 0;
      const alreadyR = isRead(n.id);
      const isFav    = isFavorite(n.category);

      // Engagement count for display
      const engDisplay = engScore !== 0 ? `${engScore > 0 ? '+' : ''}${engScore}` : '';

      // ════════════════════════════════════════════════════
      //  ORBIT CARD — Premium headline-first layout
      //  CSS class .orbit-card handles base styling.
      //  Headline uses SEPARATE DOM node with !important
      //  so NO stylesheet can ever hide it.
      // ════════════════════════════════════════════════════
      const card = document.createElement('article');
      card.className = 'orbit-card';
      card.style.setProperty('--card-accent', cat.color);
      card.style.setProperty('--cat-bg', cat.bg);
      card.style.animationDelay = `${Math.min(i * 35, 400)}ms`;
      if (alreadyR) card.style.opacity = '0.65';

      // ════════════════════════════════════════════════════
      //  CARD DOM ORDER: HEADLINE FIRST
      //  1. Headline (top, always visible even if card is short)
      //  2. Meta (source + time)
      //  3. Summary
      //  4. Footer
      // ════════════════════════════════════════════════════

      // ── 1. HEADLINE — FIRST child, always at top of card ──
      const headline = document.createElement('h3');
      headline.className = 'orbit-card-headline';
      // Direct DOM text node — no HTML parsing, no encoding issues
      headline.appendChild(document.createTextNode(n.title || '—'));
      if (n._translated) {
        const txMark = document.createElement('span');
        txMark.textContent = ' 🌐';
        txMark.style.fontSize = '10px';
        txMark.style.color    = '#00D4FF';
        headline.appendChild(txMark);
      }
      card.appendChild(headline);

      // ── 2. Meta row ──
      const metaEl = document.createElement('div');
      metaEl.className = 'orbit-card-meta';
      metaEl.innerHTML =
        `<span class="orbit-card-cat">${cat.icon} ${esc(catLabel)}</span>` +
        `<span class="orbit-card-source">${esc(n.source || 'News')}</span>` +
        `<span class="orbit-card-time">${esc(n.timeAgo || '')}</span>`;
      card.appendChild(metaEl);

      // ── 3. Summary ──
      const summaryEl = document.createElement('p');
      summaryEl.className = 'orbit-card-summary';
      summaryEl.style.setProperty('color', 'rgba(255,255,255,0.58)', 'important');
      summaryEl.appendChild(document.createTextNode(n.summary || ''));
      card.appendChild(summaryEl);

      // ── 4. Footer: readtime + trend + engagement ──
      const footer = document.createElement('div');
      footer.className = 'orbit-card-footer';
      footer.innerHTML =
        `<span class="orbit-card-readtime">📖 ${esc(n.readTime || '3 min')}</span>` +
        `<span class="orbit-card-trend ${rising?'rising':'stable'}">${rising?'↑':'→'} ${esc(rising?(t('rising')||'Rising'):(t('stable')||'Stable'))}</span>` +
        `<div class="orbit-card-actions">` +
          (engScore ? `<span class="orbit-card-eng" style="color:${liked?'#00FF88':'#FF6B35'}">${liked?'+':''}${engScore}</span>` : '') +
          `<button class="orbit-card-btn${liked?' liked':''} eng-like" data-id="${esc(n.id)}">❤️</button>` +
          `<button class="orbit-card-btn${passed?' passed':''} eng-pass" data-id="${esc(n.id)}">↓</button>` +
        `</div>`;
      card.appendChild(footer);

      footer.querySelector('.eng-like')?.addEventListener('click', e => {
        e.stopPropagation(); likeArticle(n.id); this._renderCards(this._currentNews);
      });
      footer.querySelector('.eng-pass')?.addEventListener('click', e => {
        e.stopPropagation(); passArticle(n.id); this._renderCards(this._currentNews);
      });

      card.addEventListener('click', () => { markRead(n.id); this.openArticle(n); });

      this.cardsContainer.appendChild(card);
    });
  }

  // Sort tabs are now hub-sort, wired dynamically in _initHubControls
  _initPanelTabs() {}

  _initPanelClose() {
    document.getElementById('news-panel-close')?.addEventListener('click', () => this.closePanel());
  }

  // ── Article modal ──────────────────────────────────────────────────────────
  openArticle(newsItem) {
    if (window.innerWidth < 768 && this._panelOpen) {
      this.newsPanel.classList.remove('open');
      this._panelOpen = false;
    }
    markRead(newsItem.id);
    const cat     = CATEGORIES[newsItem.category] || CATEGORIES.all;
    const flag    = COUNTRY_FLAGS[newsItem.country] || '🌍';
    const isMob   = window.innerWidth < 768;
    const date    = new Date(newsItem.timestamp).toLocaleDateString(getLang(), isMob
      ? { year:'numeric', month:'short', day:'numeric' }
      : { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    this.articleBody.innerHTML =
      `<div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.1em;padding:4px 12px;border-radius:99px;margin-bottom:16px;background:${cat.bg};color:${cat.color};border:1px solid ${cat.color}33">` +
        `${cat.icon} ${esc(t('cat_'+newsItem.category)||cat.label)}` +
      `</div>` +
      `<h1 style="font-size:clamp(17px,3vw,26px);font-weight:700;line-height:1.25;margin:0 0 14px;color:#ffffff">${esc(newsItem.title)}</h1>` +
      `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1)">` +
        `<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.6)">${flag} ${esc(newsItem.source||'')}</span>` +
        `<span style="font-size:13px;color:rgba(255,255,255,0.35)">${esc(date)}</span>` +
        `<span style="font-size:12px;color:rgba(255,255,255,0.35);margin-left:auto">📖 ${esc(newsItem.readTime||'3 min')}</span>` +
      `</div>` +
      `<div style="background:linear-gradient(135deg,rgba(0,212,255,0.07),rgba(123,47,190,0.07));border:1px solid rgba(0,212,255,0.15);border-radius:12px;padding:16px;margin-bottom:20px">` +
        `<div style="font-size:10px;font-weight:700;letter-spacing:.15em;color:#00D4FF;margin-bottom:8px">${esc(t('ai_summary')||'✦ AI SUMMARY')}</div>` +
        `<div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.65">${esc(newsItem.summary||'Read the full article for details.')}</div>` +
      `</div>` +
      `<div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8">${newsItem.content||''}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1)">` +
        (newsItem.tags||[]).map(tag => `<span style="padding:5px 12px;border-radius:99px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);font-size:12px;color:rgba(255,255,255,0.55)">#${esc(tag)}</span>`).join('') +
      `</div>`;

    this.articleModal.classList.remove('hidden');
  }

  _initArticleModal() {
    document.getElementById('article-back')?.addEventListener('click', () => this.articleModal.classList.add('hidden'));
    document.getElementById('article-modal-overlay')?.addEventListener('click', () => this.articleModal.classList.add('hidden'));
  }

  // ── AI Brief ───────────────────────────────────────────────────────────────
  _initAIBrief() {
    const btn   = document.getElementById('btn-ai-summary');
    const panel = document.getElementById('ai-panel');
    const close = document.getElementById('ai-panel-close');
    const cont  = document.getElementById('ai-panel-content');
    if (!btn||!panel) return;
    btn.addEventListener('click', () => {
      if (panel.classList.contains('hidden')) {
        cont.innerHTML = this._renderBrief();
        panel.classList.remove('hidden');
        this.profilePanel?.classList.add('hidden');
      } else panel.classList.add('hidden');
    });
    close?.addEventListener('click', () => panel.classList.add('hidden'));
    window.addEventListener('orbit:lang', () => {
      if (!panel.classList.contains('hidden')) cont.innerHTML = this._renderBrief();
    });
  }

  _renderBrief() {
    const pool = this._pool();
    if (!pool.length) return `<div style="padding:20px;color:rgba(255,255,255,0.4);font-size:14px">${t('brief_no_news')||'No live news.'}</div>`;

    const sections = [
      { cats:['politics'],              icon:'🌍', key:'brief_global' },
      { cats:['sports'],                icon:'⚽', key:'brief_sports' },
      { cats:['technology'],            icon:'💻', key:'brief_tech' },
      { cats:['science'],               icon:'🔬', key:'brief_science' },
      { cats:['entertainment','music'], icon:'🎬', key:'brief_entertainment' },
      { cats:['gaming'],                icon:'🎮', key:'brief_gaming' },
      { cats:['finance','crypto'],      icon:'📈', key:'brief_finance' },
    ];

    const parts = [];
    sections.forEach(sec => {
      const items = pool.filter(n => sec.cats.includes(n.category))
        .sort((a,b) => (getEngScore(b.id)+b.intensity)-(getEngScore(a.id)+a.intensity))
        .slice(0,2);
      if (!items.length) return;
      const label = `${sec.icon} ${t(sec.key)||sec.key}`;
      const text  = items.map(n => `<strong style="color:#fff">${esc(n.title)}</strong> — ${esc((n.summary||'').slice(0,100))}…`).join('<br><br>');
      parts.push({ label, text });
    });

    const powered = `<div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.28);font-style:italic">✦ ${t('brief_powered')||'Live news'}</div>`;
    return parts.map((p,i) => `
      ${i>0?'<div style="height:1px;background:rgba(255,255,255,0.08)"></div>':''}
      <div style="padding:${i>0?'14px 0 0':'0'}">
        <div style="font-size:10px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,0.38);margin-bottom:8px">${p.label}</div>
        <div style="font-size:13.5px;color:rgba(255,255,255,0.65);line-height:1.6">${p.text}</div>
      </div>
    `).join('')+powered;
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  _initProfile() {
    const btn   = document.getElementById('btn-profile');
    const panel = document.getElementById('profile-panel');
    const close = document.getElementById('profile-panel-close');
    if (!btn||!panel) return;
    btn.addEventListener('click', () => {
      if (panel.classList.contains('hidden')) {
        this._renderProfilePanel();
        panel.classList.remove('hidden');
        document.getElementById('ai-panel')?.classList.add('hidden');
      } else panel.classList.add('hidden');
    });
    close?.addEventListener('click', () => panel.classList.add('hidden'));
  }

  _initProfileScreen() {
    window.addEventListener('orbit:profile', () => {
      const panel = document.getElementById('profile-panel');
      if (panel&&!panel.classList.contains('hidden')) this._renderProfilePanel();
    });
  }

  _renderProfilePanel() {
    const p     = getProfile();
    const pool  = this._pool();
    const stats = getStats(pool);
    const panel = document.getElementById('profile-panel');
    if (!panel) return;

    const favCats = getFavorites();
    const catList = Object.keys(CATEGORIES).filter(c => c !== 'all');
    const countries = ['UK','US','ES','FR','DE','IT','JP','CN','IN','BR','AU','KR','RU','AR','MX','CA'];

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:18px;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#00D4FF,#7B2FBE);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0">${(p.name||'N').charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <input id="prof-name" value="${esc(p.name||'')}" maxlength="24"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:5px 10px;font-size:14px;font-weight:600;color:#fff;width:100%;outline:none"/>
          <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px">ORBIT Member</div>
        </div>
        <button id="profile-panel-close" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:rgba(255,255,255,0.5);font-size:14px;flex-shrink:0">✕</button>
      </div>

      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="flex:1;text-align:center;padding:14px 8px">
          <div style="font-size:22px;font-weight:700;color:#fff">${stats.totalRead}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">${t('profile_read')||'Read'}</div>
        </div>
        <div style="flex:1;text-align:center;padding:14px 8px;border-left:1px solid rgba(255,255,255,0.08)">
          <div style="font-size:22px;font-weight:700;color:#fff">${stats.countries}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">${t('profile_countries')||'Countries'}</div>
        </div>
        <div style="flex:1;text-align:center;padding:14px 8px;border-left:1px solid rgba(255,255,255,0.08)">
          <div style="font-size:22px;font-weight:700;color:#fff">⭐ ${favCats.length}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px">Favorites</div>
        </div>
      </div>

      <div style="overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 320px)">
        <!-- Notification opt-in -->
        <div style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(123,47,190,0.08));border:1px solid rgba(0,212,255,0.15);border-radius:12px;padding:12px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.12em;color:#00D4FF;margin-bottom:6px">📬 DAILY BRIEF AT 20:00</div>
          <p style="font-size:12.5px;color:rgba(255,255,255,0.6);line-height:1.5;margin:0 0 10px">Top 3 stories from your favorite categories every evening.</p>
          <button id="notif-btn" style="padding:7px 16px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border:none;border-radius:99px;font-size:13px;font-weight:600;color:#fff;cursor:pointer">
            Enable Notifications
          </button>
        </div>

        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,0.4);margin-bottom:10px">INTERESTS (click to add/remove)</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px" id="prof-cats">
            ${catList.map(cat => {
              const c = CATEGORIES[cat];
              const active = p.categories.includes(cat);
              const fav    = isFavorite(cat);
              return `<button class="prof-cat-btn ${active?'pca':''}" data-cat="${cat}"
                style="padding:7px 14px;border-radius:99px;font-size:12.5px;cursor:pointer;
                       background:${active?c.bg:'rgba(255,255,255,0.05)'};
                       color:${active?c.color:'rgba(255,255,255,0.5)'};
                       border:1px solid ${active?c.color+'44':'rgba(255,255,255,0.1)'}">
                ${c.icon} ${t('cat_'+cat)||c.label} ${fav?'⭐':''}
              </button>`;
            }).join('')}
          </div>
        </div>

        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,0.4);margin-bottom:10px">FOLLOWED COUNTRIES</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px" id="prof-countries">
            ${countries.map(code => {
              const flag   = COUNTRY_FLAGS[code]||'';
              const active = p.followedCountries.includes(code);
              return `<button class="prof-country-btn ${active?'pca':''}" data-country="${code}"
                style="padding:7px 12px;border-radius:99px;font-size:12.5px;cursor:pointer;
                       background:${active?'rgba(0,212,255,0.12)':'rgba(255,255,255,0.05)'};
                       color:${active?'#00D4FF':'rgba(255,255,255,0.5)'};
                       border:1px solid ${active?'rgba(0,212,255,0.3)':'rgba(255,255,255,0.1)'}">
                ${flag} ${code}
              </button>`;
            }).join('')}
          </div>
        </div>

        <button id="prof-save" style="width:100%;padding:12px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:12px;font-size:15px;font-weight:600;color:#fff;cursor:pointer;border:none">Save Profile</button>
      </div>
    `;

    // Wire close
    panel.querySelector('#profile-panel-close')?.addEventListener('click', () => panel.classList.add('hidden'));

    // Notification
    panel.querySelector('#notif-btn')?.addEventListener('click', () => {
      scheduleDailyBrief(this.getLiveNews || (() => []));
    });

    // Category toggles
    panel.querySelectorAll('.prof-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('pca');
        const active = btn.classList.contains('pca');
        const c = CATEGORIES[btn.dataset.cat];
        btn.style.background = active ? c.bg : 'rgba(255,255,255,0.05)';
        btn.style.color      = active ? c.color : 'rgba(255,255,255,0.5)';
        btn.style.border     = `1px solid ${active ? c.color+'44' : 'rgba(255,255,255,0.1)'}`;
      });
    });

    // Country toggles
    panel.querySelectorAll('.prof-country-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('pca');
        const active = btn.classList.contains('pca');
        btn.style.background = active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)';
        btn.style.color      = active ? '#00D4FF' : 'rgba(255,255,255,0.5)';
        btn.style.border     = `1px solid ${active ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.1)'}`;
      });
    });

    // Save
    panel.querySelector('#prof-save')?.addEventListener('click', () => {
      const name      = (panel.querySelector('#prof-name')?.value||'').trim()||'World Explorer';
      const categories = [...panel.querySelectorAll('.prof-cat-btn.pca')].map(b => b.dataset.cat);
      const countries  = [...panel.querySelectorAll('.prof-country-btn.pca')].map(b => b.dataset.country);
      saveProfile({ name, categories, followedCountries: countries });
      const av = document.querySelector('.avatar');
      if (av) av.textContent = name.charAt(0).toUpperCase();
      panel.classList.add('hidden');
    });
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  showTooltip(text, flag, x, y) {
    if (window.innerWidth < 768) return;
    if (!this.tooltip) return;
    this.tooltipFlag.textContent = flag||'';
    this.tooltipName.textContent = text.length>48?text.slice(0,48)+'…':text;
    this.tooltip.style.left = x+'px';
    this.tooltip.style.top  = y+'px';
    this.tooltip.classList.add('visible');
  }

  hideTooltip() { this.tooltip?.classList.remove('visible'); }

  // ── Globe event callbacks ──────────────────────────────────────────────────
  onHotspotHover(data, x, y) {
    if (window.innerWidth < 768) return;
    this.showTooltip(this._getCountryName(data.country), COUNTRY_FLAGS[data.country]||'🌍', x, y);
  }

  onHotspotLeave()    { this.hideTooltip(); }

  // ── Country Hub — the main UX entry point ─────────────────────────────────
  // Planet → tap country → country becomes a living hub with internal categories
  onCountryHubClick(data) {
    const flag    = COUNTRY_FLAGS[data.country] || '🌍';
    const pool    = data._allNews || this._pool().filter(n => n.country === data.country);
    const allNews = pool.length ? pool : this._pool().slice(0, 12);

    this._currentCountryNews = allNews;
    this._activeHubCat       = 'all';
    this._activeSort         = 'top';

    this._initHubControls(allNews);
    this.openPanel(allNews, allNews, this._getCountryName(data.country),
      `${allNews.length} ${t('stories') || 'stories'}`, flag);
  }

  onHotspotClick(data) { this.onCountryHubClick(data); }

  _initHubControls(allNews) {
    // ── Activity bar ──
    const bar = document.getElementById('hub-activity-bar');
    if (bar) {
      const counts = {};
      allNews.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });
      const total = allNews.length || 1;
      bar.innerHTML = ['sports','entertainment','gaming','technology','world','trending'].map(cat => {
        const pct = Math.max((counts[cat] || 0) / total * 100, 0.5);
        const col = (CATEGORIES[cat] || CATEGORIES.world).color;
        return `<div style="flex:${pct.toFixed(1)};background:${col}55;height:100%"></div>`;
      }).join('');
    }

    // ── Category chips — REBUILD entirely (no cloneNode) ──
    // This prevents the "Deportes2222" bug caused by repeatedly appending badges
    const hubCatsEl = document.getElementById('hub-cats');
    if (hubCatsEl) {
      const catDefs = [
        { cat:'all',           icon:'🌐', label: t('cat_all')           || 'All' },
        { cat:'sports',        icon:'⚽', label: t('cat_sports')        || 'Sports' },
        { cat:'entertainment', icon:'🎬', label: t('cat_entertainment') || 'Entertainment' },
        { cat:'gaming',        icon:'🎮', label: t('cat_gaming')        || 'Gaming' },
        { cat:'technology',    icon:'💻', label: t('cat_tech')          || 'Technology' },
        { cat:'world',         icon:'🌍', label: t('cat_world')         || 'World' },
        { cat:'trending',      icon:'🔥', label: t('cat_trending')      || 'Trending' },
      ];

      const counts = {};
      allNews.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });

      hubCatsEl.innerHTML = catDefs.map(c => {
        const count   = c.cat === 'all' ? allNews.length : (counts[c.cat] || 0);
        const isEmpty = count === 0 && c.cat !== 'all';
        const badge   = count > 0 && c.cat !== 'all'
          ? `<span style="font-size:9px;background:rgba(255,255,255,0.18);padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:700">${count}</span>`
          : '';
        return `<button class="hub-cat" data-cat="${c.cat}" style="opacity:${isEmpty?'0.3':'1'};${isEmpty?'pointer-events:none':''}">
          ${c.icon} ${esc(c.label)}${badge}
        </button>`;
      }).join('');

      // Set active chip
      const activeBtn = hubCatsEl.querySelector(`[data-cat="${this._activeHubCat || 'all'}"]`);
      activeBtn?.classList.add('active');

      // Wire click events on the NEWLY created buttons
      hubCatsEl.querySelectorAll('.hub-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          hubCatsEl.querySelectorAll('.hub-cat').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._activeHubCat = btn.dataset.cat || 'all';
          this._filterAndRenderHub();
        });
      });
    }

    // ── Sort tabs ──
    document.querySelectorAll('.hub-sort').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode?.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        document.querySelectorAll('.hub-sort').forEach(b => b.classList.remove('active'));
        fresh.classList.add('active');
        this._activeSort = fresh.dataset.sort || 'top';
        this._filterAndRenderHub();
      });
    });
  }

  _filterAndRenderHub() {
    const pool = this._currentCountryNews || [];
    const cat  = this._activeHubCat || 'all';
    const sort = this._activeSort   || 'top';

    let news = cat === 'all' ? pool : pool.filter(n => n.category === cat);
    if (!news.length) news = pool;

    if (sort === 'latest') news = [...news].sort((a, b) => b.timestamp - a.timestamp);
    if (sort === 'foryou') {
      try { const p = getProfile(); news = [...news].sort((a,b) => (p.categories.includes(b.category)?1:0)-(p.categories.includes(a.category)?1:0)); } catch(_){}
    }

    this._currentNews = news;
    this._renderCards(news);
  }

  onBackgroundClick() { this.closePanel(); this.hideTooltip(); }

  _getCountryName(code) {
    const n = {UK:'United Kingdom',US:'United States',ES:'España',FR:'France',DE:'Deutschland',JP:'Japan',CN:'China',BR:'Brasil',IN:'India',AU:'Australia',KR:'South Korea',RU:'Russia',CA:'Canada',MX:'México',AR:'Argentina',AE:'UAE',NG:'Nigeria',IT:'Italia',NL:'Netherlands',UA:'Ukraine',SA:'Saudi Arabia',ZA:'South Africa'};
    return n[code]||code;
  }

  // ── Trending ───────────────────────────────────────────────────────────────
  _initTrending() {
    const topics = getTrendingTopics();
    const scroll = document.getElementById('trending-scroll');
    if (!scroll) return;
    const doubled = [...topics,...topics];
    scroll.innerHTML = `<div class="trending-inner">${doubled.map((item,i)=>`
      <span class="trending-item" data-idx="${i%topics.length}" style="cursor:pointer">
        <span class="trending-item-rank">#${(i%topics.length)+1}</span>
        <span class="trending-item-label">${esc(item.label)}</span>
        <span class="trending-item-count">${esc(item.count)}</span>
      </span>${i<doubled.length-1?'<span class="trending-sep">·</span>':''}
    `).join('')}</div>`;
    scroll.querySelectorAll('.trending-item').forEach(el=>{
      el.addEventListener('click',()=>{
        const topic=topics[parseInt(el.dataset.idx)];if(!topic)return;
        const q=topic.label.replace('#','').toLowerCase();
        const pool=this._pool();
        const results=pool.filter(n=>n.title.toLowerCase().includes(q)||(n.tags||[]).some(t=>t.toLowerCase().includes(q)));
        if(results.length)this.openPanel(results,results,`🔥 ${topic.label}`,`${results.length} ${t('stories')||'stories'}`,'🔥');
      });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  _initSearch() {
    const input=document.getElementById('search-input');
    const results=document.getElementById('search-results');
    if(!input||!results)return;
    input.addEventListener('input',()=>{
      clearTimeout(this._searchTimeout);
      this._searchTimeout=setTimeout(()=>{
        const q=input.value.trim().toLowerCase();
        if(!q){results.classList.remove('visible');return;}
        const pool=this._pool();
        const found=pool.filter(n=>n.title.toLowerCase().includes(q)||(n.summary||'').toLowerCase().includes(q)||(n.tags||[]).some(t=>t.includes(q))|(n.country||'').toLowerCase().includes(q)|(n.category||'').includes(q)).slice(0,6);
        if(!found.length){results.classList.remove('visible');return;}
        results.innerHTML=found.map(n=>{const cat=CATEGORIES[n.category]||CATEGORIES.all;const flag=COUNTRY_FLAGS[n.country]||'';return`<div class="search-result-item" data-id="${esc(n.id)}" style="cursor:pointer"><span style="font-size:18px">${cat.icon}</span><div><div style="font-size:13px;font-weight:500;color:#fff">${esc(n.title.slice(0,55))}…</div><div style="font-size:11px;color:rgba(255,255,255,0.4)">${flag} ${this._getCountryName(n.country)} · ${t('cat_'+n.category)||cat.label}</div></div></div>`;}).join('');
        results.classList.add('visible');
        results.querySelectorAll('.search-result-item').forEach(el=>{el.addEventListener('click',()=>{const item=found.find(n=>n.id===el.dataset.id);if(item){this.openArticle(item);results.classList.remove('visible');input.value='';this.globe.flyToClose?.(item.lat,item.lng);}});});
      },280);
    });
    document.addEventListener('click',e=>{if(!e.target.closest('#search-wrap'))results.classList.remove('visible');});
  }

  // ── Globe controls ─────────────────────────────────────────────────────────
  _initGlobeControls() {
    const btnA=document.getElementById('btn-autorotate');let autoOn=true;
    document.getElementById('btn-zoom-in')?.addEventListener('click',()=>this.globe.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click',()=>this.globe.zoomOut());
    document.getElementById('btn-reset')?.addEventListener('click',()=>this.globe.resetView());
    btnA?.addEventListener('click',()=>{autoOn=!autoOn;this.globe.toggleAutoRotate(autoOn);btnA.classList.toggle('active',autoOn);});
  }

  // ── World clock ────────────────────────────────────────────────────────────
  _startWorldClock() {
    const zones={'clk-nyc':'America/New_York','clk-lon':'Europe/London','clk-tky':'Asia/Tokyo','clk-dxb':'Asia/Dubai'};
    const tick=()=>{const now=new Date();Object.entries(zones).forEach(([id,tz])=>{const el=document.getElementById(id);if(el)el.textContent=now.toLocaleTimeString('en-US',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false});});};
    tick();setInterval(tick,1000);
  }
}
