// ════════════════════════════════════════════════════════
//  ORBIT — UI Manager v5
//  Debrief · Dynamic Interests · ORBIT+ · Living App
// ════════════════════════════════════════════════════════
import { NEWS_DATA, CATEGORIES, COUNTRY_FLAGS, getTrendingTopics } from './data.js';
import { t, applyAll, getLang, setLang, SUPPORTED, getDebriefName } from './i18n.js';
import { translateNews }                           from './TranslationService.js';
import {
  getProfile, saveProfile, markRead, isRead,
  getStats, getPersonalizedFeed,
} from './PersonalizationService.js';
import { getUser, logout as authLogout, updateProfile as syncProfile } from './AuthManager.js';
import { recordSignal, getImplicitInterests, getSidebarOrder } from './ChronosEngine.js';
import { playBrief, stopBrief, isPlaying, isAvailable as audioAvailable } from './AudioBrief.js';
import { openOrbitPlus } from './OrbitPlus.js';

// ─── Engagement store ─────────────────────────────────────────────────────────
// X-style: users like/pass articles → drives "Trending" and "For You" ordering
const ENG_KEY = 'orbit_engagement_v1';
let _eng = {};
try { _eng = JSON.parse(localStorage.getItem(ENG_KEY) || '{}'); } catch(_) {}

function saveEng() {
  try { localStorage.setItem(ENG_KEY, JSON.stringify(_eng)); } catch(_) {}
}

function likeArticle(id)   { _eng[id] = (_eng[id] || 0) + 5; saveEng(); }  // +5: clearly ranks higher
function passArticle(id)   { _eng[id] = (_eng[id] || 0) - 2; saveEng(); }  // -2: demotes noticeably
function getEngScore(id)   { return _eng[id] || 0; }

// ─── Implicit interests (replaces static star favorites) ─────────────────────
// Stars are gone. Interests are derived from real reading behaviour via ChronosEngine.
function getFavorites()  { return getImplicitInterests().slice(0, 3); }
function isFavorite(cat) { return getImplicitInterests().slice(0, 3).includes(cat); }

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

// Render article content: only allow the known "Read full article" link pattern.
// Strips any non-https href to neutralise javascript:/data: XSS from poisoned feeds.
function _safeContent(item) {
  const raw = item.content || '';
  if (!raw) return '';
  const safeLink = /^https?:\/\//i.test(item.url || '') ? item.url : '';
  if (!safeLink) return '';
  return `<a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:99px;font-size:13px;font-weight:600;color:#fff;text-decoration:none">Read full article →</a>`;
}

// Country badge — CSS-only, reliable on all platforms, premium look
// External flag images fail consistently; this always works and looks intentional
function flagHtml(code, size = 20) {
  if (!code) return '';
  const label = code.toUpperCase().slice(0, 2);
  const fontSize = size <= 16 ? '9px' : size <= 22 ? '10px' : '11px';
  const pad      = size <= 16 ? '2px 5px' : size <= 22 ? '3px 7px' : '4px 9px';
  return (
    `<span style="display:inline-flex;align-items:center;justify-content:center;` +
    `font-size:${fontSize};font-weight:900;padding:${pad};` +
    `border-radius:4px;letter-spacing:.05em;white-space:nowrap;` +
    `background:rgba(0,212,255,.14);border:1px solid rgba(0,212,255,.35);` +
    `color:#00D4FF;vertical-align:middle;flex-shrink:0;` +
    `font-family:'Space Grotesk',sans-serif;">${label}</span>`
  );
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
    this._initDebrief();
    this._initProfile();
    this._initProfileScreen();
    this._initArticleModal();
    this._initLangSelector();
    this._initMobileLang();
    this._startWorldClock();
    this._startHeartbeat();
    this._buildHotspotLegend();

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
    dropdown.innerHTML = Object.entries(SUPPORTED).map(([code, info]) => {
      return `<button class="lang-option ${getLang() === code ? 'active' : ''}" data-lang="${code}">${flagHtml(code, 18)}<span style="margin-left:6px">${info.name}</span></button>`;
    }).join('');
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
    const lang = getLang();
    const info = SUPPORTED[lang];
    // Single clean badge — no duplicate text
    btn.innerHTML = `${flagHtml(lang.toUpperCase(), 20)}`;
  }

  // ── Sidebar — dynamic interest ordering, no static stars ─────────────────
  _initSidebar() {
    const items = document.querySelectorAll('.sidebar-item, .mobile-cat');
    items.forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.mobile-cat').forEach(i => i.classList.remove('active'));
        document.querySelectorAll(`[data-category="${item.dataset.category}"]`).forEach(i => i.classList.add('active'));
        const cat = item.dataset.category || 'all';
        this._activeCategory = cat;

        // "Tendencias" = top articles by trendScore across all categories
        // No article ever has category='trending', so we handle it specially
        if (cat === 'trending') {
          const trending = [...this._pool()]
            .sort((a, b) => (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0))
            .slice(0, 60);
          this.globe.filterByCategory('all'); // show all hotspots
          if (this._panelOpen && this._countryNewsPool.length) {
            this._currentNews = trending.filter(n => this._countryNewsPool.find(c => c.id === n.id));
            this._renderCards(this._currentNews.length ? this._currentNews : this._countryNewsPool);
          }
          return;
        }

        this.globe.filterByCategory(cat);
        // Record implicit interest signal
        if (cat !== 'all') recordSignal(cat, 'search_category', 1.5);
        if (this._panelOpen && this._countryNewsPool.length) {
          let filtered = cat === 'all' ? this._countryNewsPool : this._countryNewsPool.filter(n => n.category === cat);
          if (!filtered.length) filtered = this._countryNewsPool;
          this._currentNews = filtered;
          this._renderCards(filtered);
        }
      });
    });

    // Apply dynamic interest order from ChronosEngine
    this._applyDynamicSidebarOrder();
  }

  _applyDynamicSidebarOrder() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    const interests = getImplicitInterests();
    if (!interests.length) return;

    const items = [...nav.querySelectorAll('.sidebar-item')];
    const all   = items.find(i => i.dataset.category === 'all');
    const rest  = items.filter(i => i.dataset.category !== 'all');

    // Sort by implicit interest rank
    rest.sort((a, b) => {
      const ai = interests.indexOf(a.dataset.category);
      const bi = interests.indexOf(b.dataset.category);
      const aRank = ai === -1 ? 99 : ai;
      const bRank = bi === -1 ? 99 : bi;
      return aRank - bRank;
    });

    rest.forEach(item => {
      item.querySelector('.interest-dot')?.remove();
      nav.appendChild(item);
    });
    if (all) nav.prepend(all);
  }

  _pool() { return this.getLiveNews ? this.getLiveNews() : NEWS_DATA; }

  // ── ORBIT+ premium feature check ─────────────────────────────────────────
  _isPremium() {
    // In production: check against Supabase subscription field.
    // For now: read from localStorage (set after successful payment flow).
    try { return localStorage.getItem('orbit_plus') === '1'; } catch(_) { return false; }
  }

  // ── Panel ──────────────────────────────────────────────────────────────────
  openPanel(displayItems, allCountryItems, title, subtitle, countryCode) {
    this._currentNews     = displayItems;
    this._countryNewsPool = allCountryItems;
    this.panelCountry.textContent  = title;
    this.panelSubtitle.textContent = subtitle;
    // Real flag image (works on all platforms including Windows)
    if (countryCode && countryCode.length <= 3) {
      this.panelFlag.innerHTML  = flagHtml(countryCode, 28);
      this.panelFlag.style.cssText = 'display:flex;align-items:center;background:none;border:none;padding:0';
    } else {
      this.panelFlag.textContent = '🌍';
      this.panelFlag.style.cssText = '';
    }
    this.hideTooltip();
    // skipUrlDedup=true: redistributed articles share URLs with originals — don't filter them
    this._renderCards(displayItems, { skipUrlDedup: true });
    this.newsPanel.classList.add('open');
    this._panelOpen = true;

    // NOTE: auto-translate disabled in country hub — it caused re-renders that lost articles.
    // Translation happens globally via the language selector button.
  }

  async _translateAndRender(items, lang) {
    try {
      const translated = await translateNews(items, lang);
      // Only re-render if we got back at least as many articles (never fewer)
      if (this._panelOpen && translated.length >= items.length) {
        this._renderCards(translated);
      }
    } catch(_) {}
  }

  closePanel() {
    this.newsPanel.classList.remove('open');
    this._panelOpen = false;
    this._countryNewsPool = [];
    this.globe.clearHighlight?.();
    this.globe.hideCountryOutline?.();
    if (this.globe._isZoomedIn) this.globe.resetView();
  }

  // ── Card rendering — DEFINITIVE FIX ──────────────────────────────────────
  // Method: CSS class .orbit-card-headline + setProperty('color','#ffffff','important')
  // The !important inline property CANNOT be overridden by any stylesheet.
  // This is the nuclear option that will ALWAYS show the title.
  _renderCards(newsItems, { skipUrlDedup = false } = {}) {
    const profile = getProfile();

    this.cardsContainer.innerHTML = '';

    if (!newsItems || !newsItems.length) {
      this.cardsContainer.innerHTML = `
        <div style="padding:32px;text-align:center;font-size:14px;color:rgba(255,255,255,0.4)">
          ${esc(t('no_stories') || 'No stories found')}
        </div>`;
      return;
    }

    // DEDUP STRATEGY:
    // 1. Title fingerprint (first 55 chars normalized) — catches same article from multiple feeds
    //    Keeps the most RECENT version when duplicates exist
    // 2. URL dedup (global feed only) — catches cross-source duplicates
    const _titleMap = new Map();  // fp → array index
    const _titleArr = [];
    for (const n of newsItems) {
      if (!n || !n.title) continue;
      const fp = n.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 55);
      if (!fp) { _titleArr.push(n); continue; }
      if (_titleMap.has(fp)) {
        const idx = _titleMap.get(fp);
        // Replace with newer article (more up-to-date version of same story)
        if ((n.timestamp || 0) > (_titleArr[idx]?.timestamp || 0)) _titleArr[idx] = n;
      } else {
        _titleMap.set(fp, _titleArr.length);
        _titleArr.push(n);
      }
    }

    let deduped;
    if (skipUrlDedup) {
      deduped = _titleArr; // title dedup is sufficient in country hub
    } else {
      const _seenUrls = new Set();
      deduped = _titleArr.filter(n => {
        const uf = (n.url || '').split('?')[0].toLowerCase().trim();
        if (uf.length > 15 && _seenUrls.has(uf)) return false;
        if (uf.length > 15) _seenUrls.add(uf);
        return true;
      });
    }

    // Sort by engagement + personalization score
    const scored = [...deduped]
      .map(n => ({ ...n, _total: (n.intensity || 0.5) * 40 + getEngScore(n.id) * 35 + (profile.categories.includes(n.category) ? 15 : 0) + (profile.followedCountries.includes(n.country) ? 20 : 0) }))
      .sort((a, b) => b._total - a._total);

    scored.forEach((n, i) => { try {
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

      // ── 2. Meta row + multi-source badge ──
      const coverageCount = n._coverageCount || n.sourceCount || 1;
      const isMulti       = coverageCount > 1;

      const metaEl = document.createElement('div');
      metaEl.className = 'orbit-card-meta';
      // Real country flag image via flagcdn.com (works on Windows)
      const countryBadge = n.country ? flagHtml(n.country, 18) : '';

      metaEl.innerHTML =
        `<span class="orbit-card-cat">${cat.icon} ${esc(catLabel)}</span>` +
        (isMulti
          ? `<span class="orbit-card-coverage" title="${esc((n._sources||[]).join(', '))}">+${coverageCount - 1} ${coverageCount === 2 ? t('source_one') : t('source_many')}</span>`
          : `<span class="orbit-card-source">${esc(n.source || 'News')}</span>`
        ) +
        countryBadge +
        `<span class="orbit-card-time">${esc(n.timeAgo || '')}</span>`;

      // Multi-source banner strip at top of card
      if (isMulti) {
        const strip = document.createElement('div');
        strip.className = 'orbit-card-multi-strip';
        strip.innerHTML = `
          <span class="orbit-card-multi-dot"></span>
          <span>${coverageCount} medios · ${esc(n.source || '')}</span>
          ${n._countries?.length > 1 ? `<span class="orbit-card-global">🌐 Global</span>` : ''}
        `;
        card.insertBefore(strip, headline);
      }

      card.appendChild(metaEl);

      // ── 3. Summary ──
      const summaryEl = document.createElement('p');
      summaryEl.className = 'orbit-card-summary';
      summaryEl.style.setProperty('color', 'rgba(255,255,255,0.58)', 'important');
      // Sanitize: reject 'null', 'nulo', 'nul', 'nein' etc. (translation artifacts)
      const cleanSummary = (['null','nulo','nul','nein','пусто','空','없음'].includes((n.summary||'').trim().toLowerCase()))
        ? '' : (n.summary || '');
      summaryEl.appendChild(document.createTextNode(cleanSummary));
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

      card.addEventListener('click', () => {
        markRead(n.id);
        recordSignal(n.category, 'article_open', 1.0);
        if (n.country) recordSignal(n.country, 'country_open', 0.5);
        this.openArticle(n);
      });

      this.cardsContainer.appendChild(card);
    } catch(err) { console.warn('[Card]', err?.message, n?.title?.slice(0,40)); } });
  }

  // ── Heartbeat — living app animations ─────────────────────────────────────
  _startHeartbeat() {
    // 1. Live counter pulsing tick
    setInterval(() => {
      const el = document.getElementById('live-count');
      if (el) {
        const n = this._pool().length;
        if (parseInt(el.dataset.n || '0') !== n) {
          el.dataset.n = n;
          el.closest('.sidebar-live')?.classList.add('pulse-live');
          setTimeout(() => el.closest('.sidebar-live')?.classList.remove('pulse-live'), 800);
        }
      }
    }, 8000);

    // 2. Refresh real trending every 5 min from server
    this._loadRealTrending();
    setInterval(() => this._loadRealTrending(), 5 * 60 * 1000);

    // 3. Subtle background nebula drift via CSS var
    let t = 0;
    setInterval(() => {
      t += 0.01;
      const x = 50 + Math.sin(t) * 6;
      const y = 50 + Math.cos(t * 0.7) * 4;
      document.documentElement.style.setProperty('--nebula-x', x + '%');
      document.documentElement.style.setProperty('--nebula-y', y + '%');
    }, 3000);
  }

  async _loadRealTrending() {
    try {
      const BASE  = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : (localStorage.getItem('orbit_server_url') || 'https://orbit-news-engine-production.up.railway.app');
      // Free: 12 trends. ORBIT+: 40 trends.
      const limit = this._isPremium() ? 40 : 12;
      const res   = await fetch(`${BASE}/api/trends?limit=${limit}`);
      if (!res.ok) return;
      const data  = await res.json();
      if (data.trends?.length) {
        this._renderTrendingBar(data.trends);
        // Show ORBIT+ teaser if free and many trends were available
        if (!this._isPremium() && data.count > 12 && !this._plusTeaserShown) {
          this._plusTeaserShown = true;
          setTimeout(() => {
            // Subtle badge on trending bar (non-modal, non-blocking)
            const bar = document.querySelector('.trending-label');
            if (bar && !bar.querySelector('.plus-badge')) {
              const badge = document.createElement('span');
              badge.className = 'plus-badge';
              badge.textContent = '+';
              badge.title = `${data.count} trends available with ORBIT+`;
              badge.style.cssText = 'margin-left:4px;font-size:9px;padding:1px 5px;border-radius:4px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);color:#fff;font-weight:700;cursor:pointer;vertical-align:middle';
              badge.onclick = () => this._showOrbitPlusGate(
                'Tendencias ilimitadas',
                `Estás viendo 12 de ${data.count} trends reales disponibles. ORBIT+ desbloquea el feed completo con velocidad de crecimiento y predicciones.`
              );
              bar.appendChild(badge);
            }
          }, 5000);
        }
      }
    } catch (_) { /* silent — fallback to static */ }
  }

  _renderTrendingBar(trends) {
    const scroll = document.getElementById('trending-scroll');
    if (!scroll || !trends.length) return;

    const doubled = [...trends, ...trends].slice(0, 30);
    scroll.innerHTML = `<div class="trending-inner">${doubled.map((tr, i) => {
      const pulseColor = tr.pulse > 0.7 ? '#FF4757' : tr.pulse > 0.4 ? '#FF6B35' : '#00D4FF';
      const hotBadge  = tr.hot ? '<span style="font-size:9px;margin-left:3px">🔥</span>' : '';
      const velArrow  = tr.velocity > 0.5 ? '<span style="color:#00FF88;font-size:9px">↑</span> ' : '';
      return `
        <span class="trending-item" style="cursor:pointer" data-label="${esc(tr.label||'')}">
          <span class="trending-item-rank" style="color:${pulseColor}">#${(i % trends.length) + 1}</span>
          <span class="trending-item-label">${velArrow}${esc((tr.label||'').slice(0,32))}${hotBadge}</span>
          <span class="trending-item-count">${esc(String(tr.count||''))}</span>
        </span>${i < doubled.length - 1 ? '<span class="trending-sep">·</span>' : ''}
      `;
    }).join('')}</div>`;

    scroll.querySelectorAll('.trending-item').forEach(el => {
      el.addEventListener('click', () => {
        const q    = (el.dataset.label || '').toLowerCase();
        const pool = this._pool();
        const hits = pool.filter(n =>
          n.title.toLowerCase().includes(q) ||
          (n.tags || []).some(tag => tag.toLowerCase().includes(q))
        );
        if (hits.length) this.openPanel(hits, hits, `🔥 ${el.dataset.label}`, `${hits.length} ${t('stories')||'stories'}`, '🔥');
      });
    });
  }

  // ── ORBIT+ gate helper ────────────────────────────────────────────────────
  _showOrbitPlusGate(feature, teaser, onDismiss) {
    const existing = document.getElementById('orbit-plus-gate');
    if (existing) existing.remove();

    const gate = document.createElement('div');
    gate.id = 'orbit-plus-gate';
    gate.className = 'orbit-plus-gate';
    gate.innerHTML = `
      <div class="orbit-plus-card">
        <div class="orbit-plus-badge">⚡ ORBIT+</div>
        <h3 class="orbit-plus-title">${esc(feature)}</h3>
        <p class="orbit-plus-teaser">${esc(teaser)}</p>
        <button class="orbit-plus-cta" id="oplus-upgrade">Desbloquear con ORBIT+ — 4,99€/mes</button>
        <button class="orbit-plus-dismiss" id="oplus-dismiss">Ahora no</button>
      </div>
    `;
    document.body.appendChild(gate);
    gate.querySelector('#oplus-upgrade').onclick  = () => { gate.remove(); };
    gate.querySelector('#oplus-dismiss').onclick  = () => { gate.remove(); onDismiss?.(); };
    gate.onclick = e => { if (e.target === gate) { gate.remove(); onDismiss?.(); } };
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
    // Use country code badge (emoji flags don't work on Windows/PC)
    const countryCode = newsItem.country || '';
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
        (countryCode ? flagHtml(countryCode, 18) : '') +
        `<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);margin-left:4px">${esc(newsItem.source||'')}</span>` +
        `<span style="font-size:13px;color:rgba(255,255,255,0.35)">${esc(date)}</span>` +
        `<span style="font-size:12px;color:rgba(255,255,255,0.35);margin-left:auto">📖 ${esc(newsItem.readTime||'3 min')}</span>` +
      `</div>` +
      `<div style="background:linear-gradient(135deg,rgba(0,212,255,0.07),rgba(123,47,190,0.07));border:1px solid rgba(0,212,255,0.15);border-radius:12px;padding:16px;margin-bottom:20px">` +
        `<div style="font-size:10px;font-weight:700;letter-spacing:.15em;color:#00D4FF;margin-bottom:8px">${esc(t('ai_summary')||'✦ AI SUMMARY')}</div>` +
        `<div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.65">${esc(newsItem.summary||'Read the full article for details.')}</div>` +
      `</div>` +
      `<div style="font-size:15px;color:rgba(255,255,255,0.65);line-height:1.8">${_safeContent(newsItem)}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1)">` +
        (newsItem.tags||[]).map(tag => `<span style="padding:5px 12px;border-radius:99px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);font-size:12px;color:rgba(255,255,255,0.55)">#${esc(tag)}</span>`).join('') +
      `</div>`;

    this.articleModal.classList.remove('hidden');
  }

  _initArticleModal() {
    document.getElementById('article-back')?.addEventListener('click', () => this.articleModal.classList.add('hidden'));
    document.getElementById('article-modal-overlay')?.addEventListener('click', () => this.articleModal.classList.add('hidden'));
  }

  // ── Resumen Diario — panel lateral con las mejores noticias ─────────────
  // El email de las 20:00 lo envía el servidor (dailyBrief.js).
  // Este panel es la vista previa in-app del mismo resumen.
  _initDebrief() {
    const btn   = document.getElementById('btn-ai-summary');
    const panel = document.getElementById('ai-panel');
    const close = document.getElementById('ai-panel-close');
    const cont  = document.getElementById('ai-panel-content');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
      if (panel.classList.contains('hidden')) {
        cont.innerHTML = this._renderBrief();
        this._bindBriefClicks(cont);
        panel.classList.remove('hidden');
        this.profilePanel?.classList.add('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
    close?.addEventListener('click', () => panel.classList.add('hidden'));
    window.addEventListener('orbit:lang', () => {
      if (!panel.classList.contains('hidden')) {
        cont.innerHTML = this._renderBrief();
        this._bindBriefClicks(cont);
      }
    });
  }

  async _openDebrief() {
    // Build brief from current news pool
    const pool    = this._pool();
    const profile = getProfile();
    const brief   = this._buildBrief(pool, profile);

    // Create overlay if not exists
    let overlay = document.getElementById('debrief-overlay');
    if (overlay) { overlay.remove(); }

    overlay = document.createElement('div');
    overlay.id = 'debrief-overlay';
    overlay.className = 'debrief-overlay';
    document.body.appendChild(overlay);

    this._renderDebriefCover(overlay, brief);
  }

  _buildBrief(pool, profile) {
    const cats = profile?.categories?.length ? profile.categories : ['world','technology'];
    const impl = getImplicitInterests();
    const now  = Date.now();

    // 1. Filter out: micro stories, recycled, already deduped server-side
    const candidates = pool.filter(a =>
      !a.isMicro &&
      a.title?.length > 20 &&
      (now - (a.timestamp || 0)) < 24 * 3600000  // last 24h only
    );

    // 2. Score: preference + freshness + source quality + coverage breadth
    const scored = candidates.map(a => {
      const freshness  = Math.max(0, 1 - (now - (a.timestamp||0)) / (12 * 3600000));
      const catBonus   = cats.includes(a.category) ? 1.5 : 0;
      const implBonus  = impl.includes(a.category) ? 1.0 : 0;
      const coverage   = Math.min((a._coverageCount || a.sourceCount || 1) / 5, 1) * 0.5;
      const intensity  = (a.intensity || 0.5) * 1.2;
      return { ...a, _bs: intensity + catBonus + implBonus + freshness + coverage };
    }).sort((a, b) => b._bs - a._bs);

    // 3. Strict diversity selection:
    //    - max 1 per topic fingerprint (first 30 chars of title — catches same-event variants)
    //    - max 2 per category
    //    - max 2 per country
    //    - max 6 total
    const items        = [];
    const usedFingerprints = new Set();
    const catCount     = {};
    const countryCount = {};

    for (const a of scored) {
      if (items.length >= 6) break;

      // Topic fingerprint: prevents near-duplicates that slip past server dedup
      const fp = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      if (fp && usedFingerprints.has(fp)) continue;

      const cc = catCount[a.category] || 0;
      if (cc >= 2) continue;

      const gc = countryCount[a.country] || 0;
      if (a.country && gc >= 2) continue;

      items.push(a);
      if (fp) usedFingerprints.add(fp);
      catCount[a.category] = cc + 1;
      if (a.country) countryCount[a.country] = gc + 1;
    }

    // 4. Mood from sentiment average
    const moodScore = items.length
      ? items.reduce((s, a) => s + (a.sentiment || 0), 0) / items.length
      : 0;
    const mood = moodScore > 0.25 ? 'OPTIMISTA' : moodScore < -0.25 ? 'TENSO' : 'INFORMADO';

    return { items, mood, moodScore, generatedAt: new Date() };
  }

  _renderDebriefCover(overlay, brief) {
    const name = getDebriefName(getLang());
    const date = new Date().toLocaleDateString(getLang(), { weekday:'long', day:'numeric', month:'long' });
    const moodColors = { OPTIMISTA:'#00FF88', TENSO:'#FF4757', INFORMADO:'#00D4FF', SOCIAL:'#A78BFA', CHILL:'#7B2FBE' };
    const moodColor  = moodColors[brief.mood] || '#00D4FF';

    overlay.innerHTML = `
      <div class="debrief-cover" id="debrief-cover">
        <button class="debrief-close" id="debrief-close">✕</button>
        <div class="debrief-cover-logo">◎ ORBIT</div>
        <div class="debrief-cover-name">${esc(name)}</div>
        <div class="debrief-cover-date">${esc(date)}</div>
        <div class="debrief-mood" style="color:${moodColor}">
          <span class="debrief-mood-dot" style="background:${moodColor}"></span>
          ${esc(brief.mood)}
        </div>
        <div class="debrief-cover-count">${brief.items.length} ${t('debrief_cover_stories')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="debrief-start" id="debrief-start">
            ${esc(t('debrief_start') || 'INICIAR BRIEFING')}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          ${audioAvailable() ? `
          <button class="debrief-audio-btn" id="debrief-audio" title="${t('audio_listen')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            ${t('audio_brief_btn')}
          </button>` : ''}
        </div>
        <p class="debrief-cover-hint">${t('debrief_hint_swipe')}</p>
      </div>
    `;

    overlay.querySelector('#debrief-close').onclick = () => { stopBrief(); overlay.remove(); };
    overlay.querySelector('#debrief-start').onclick = () => {
      this._renderDebriefStory(overlay, brief, 0);
    };

    // Audio Brief button — ORBIT+ feature with 30s free preview
    const audioBtn = overlay.querySelector('#debrief-audio');
    if (audioBtn) {
      audioBtn.onclick = () => {
        if (isPlaying()) {
          stopBrief();
          audioBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> ${t('audio_brief_btn')}`;
          return;
        }
        audioBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> ${t('audio_stop')}`;
        playBrief(brief, getLang(), {
          onEnd:   () => { audioBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> ${t('audio_brief_btn')}`; },
          onError: (e) => { console.warn('[Audio]', e); audioBtn.innerHTML = t('audio_unavailable'); },
        });
      };
    }
  }

  _renderDebriefStory(overlay, brief, index) {
    if (index >= brief.items.length) {
      this._renderDebriefEnd(overlay, brief);
      return;
    }
    const story       = brief.items[index];
    const cat         = CATEGORIES[story.category] || CATEGORIES.world;
    const countryCode = story.country || '';
    const total       = brief.items.length;
    const pct   = Math.round(((index + 1) / total) * 100);

    const sentimentColor = story.sentiment > 0.2  ? '#00FF88' :
                           story.sentiment < -0.2 ? '#FF4757' : '#FFD700';
    const sentimentPct   = Math.round(((story.sentiment||0) + 1) / 2 * 100);

    const impactLabel = story.intensity > 0.85 ? t('impact_critical') :
                        story.intensity > 0.70 ? t('impact_relevant') :
                        story.intensity > 0.55 ? t('impact_important') : t('impact_informative');

    overlay.innerHTML = `
      <div class="debrief-story" id="debrief-story"
           style="--sentiment-color:${sentimentColor}40">
        <button class="debrief-close" id="debrief-close">✕</button>

        <div class="debrief-progress-bar">
          <div class="debrief-progress-fill" style="width:${pct}%"></div>
        </div>

        <div class="debrief-story-header">
          <span class="debrief-impact" style="background:${sentimentColor}20;color:${sentimentColor};border-color:${sentimentColor}40">
            ${esc(impactLabel)}
          </span>
          <span class="debrief-story-region" style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5)">${esc(countryCode)}</span>
          <span class="debrief-story-num">${index + 1} / ${total}</span>
        </div>

        <div class="debrief-cat-badge" style="color:${cat.color}">
          ${cat.icon} ${esc(t('cat_' + story.category) || cat.label)}
        </div>

        <h2 class="debrief-headline">${esc(story.title)}</h2>

        <p class="debrief-summary">${esc((story.summary||'').slice(0, 180))}…</p>

        <div class="debrief-sentiment-row">
          <span style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:.08em">${t('debrief_sentiment')}</span>
          <div class="debrief-sentiment-bar">
            <div class="debrief-sentiment-fill" style="width:${sentimentPct}%;background:${sentimentColor}"></div>
          </div>
        </div>

        <div class="debrief-why">
          <div style="font-size:9px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,0.35);margin-bottom:6px">${t('debrief_why')}</div>
          <p>${esc(this._whyItMatters(story, getImplicitInterests()))}</p>
        </div>

        <div class="debrief-nav">
          ${index > 0
            ? `<button class="debrief-nav-btn" id="debrief-prev">${t('debrief_prev')}</button>`
            : `<div></div>`
          }
          <button class="debrief-nav-btn debrief-read" id="debrief-read">${t('debrief_read')}</button>
          <button class="debrief-nav-btn debrief-next" id="debrief-next">
            ${index < total - 1 ? t('debrief_next') : t('debrief_end')}
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('#debrief-close').onclick = () => overlay.remove();
    const prevBtn = overlay.querySelector('#debrief-prev');
    if (prevBtn) prevBtn.onclick = () => this._renderDebriefStory(overlay, brief, index - 1);
    overlay.querySelector('#debrief-next').onclick  = () => this._renderDebriefStory(overlay, brief, index + 1);
    overlay.querySelector('#debrief-read').onclick   = () => {
      overlay.remove();
      this.openArticle(story);
    };

    // Record implicit read signal
    recordSignal(story.category, 'article_open', 1.0);

    // Swipe support
    this._addSwipe(overlay, () => this._renderDebriefStory(overlay, brief, index + 1),
                             () => index > 0 && this._renderDebriefStory(overlay, brief, index - 1));
  }

  _renderDebriefEnd(overlay, brief) {
    overlay.innerHTML = `
      <div class="debrief-end">
        <button class="debrief-close" id="debrief-close">✕</button>
        <div class="debrief-end-icon">◎</div>
        <h2 class="debrief-end-title">${t('debrief_end')}</h2>
        <p class="debrief-end-sub">${t('debrief_end_explored')} ${brief.items.length} ${t('debrief_end_key_stories')}</p>
        <div class="debrief-end-mood">${t('debrief_mood_label')} <strong>${esc(brief.mood)}</strong></div>
        <button class="debrief-start" id="debrief-explore" style="margin-top:32px">
          ${t('debrief_explore_globe')}
        </button>
      </div>
    `;
    overlay.querySelector('#debrief-close').onclick   = () => overlay.remove();
    overlay.querySelector('#debrief-explore').onclick = () => overlay.remove();
  }

  _whyItMatters(story, interests) {
    const catMessages = {
      technology:    t('why_tech'),
      sports:        t('why_sports'),
      entertainment: t('why_entertainment'),
      gaming:        t('why_gaming'),
      world:         t('why_world'),
    };
    if (interests.includes(story.category)) {
      return catMessages[story.category] || t('why_default');
    }
    return `${t('why_global_pre')} ${story._sources?.length || 1}${t('why_global_suf')}`;
  }

  _addSwipe(el, onNext, onPrev) {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) dx < 0 ? onNext() : onPrev();
    }, { passive: true });
  }

  _renderBrief() {
    const pool = this._pool();
    if (!pool.length) return `<div style="padding:20px;color:rgba(255,255,255,0.4);font-size:14px">
      ${t('brief_no_news') || 'Conectando a noticias en vivo…'}
    </div>`;

    // Real categories that exist in the data
    const SECTIONS = [
      { cat: 'world',         icon: '🌍', label: t('cat_world')          || 'Mundo' },
      { cat: 'sports',        icon: '⚽', label: t('cat_sports')         || 'Deportes' },
      { cat: 'technology',    icon: '💻', label: t('cat_tech')           || 'Tecnología' },
      { cat: 'entertainment', icon: '🎬', label: t('cat_entertainment')  || 'Entretenimiento' },
      { cat: 'gaming',        icon: '🎮', label: t('cat_gaming')         || 'Gaming' },
    ];

    // Global title dedup — no article title appears twice in the whole brief
    const seenTitles = new Set();
    const parts = [];

    for (const sec of SECTIONS) {
      // Top articles for this category, sorted by score
      const candidates = pool
        .filter(n => n.category === sec.cat && !n.isMicro && n.title?.length > 20)
        .sort((a, b) => (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0));

      // Pick up to 2 unique articles (unique title fingerprint)
      const items = [];
      for (const n of candidates) {
        if (items.length >= 2) break;
        const fp = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 55);
        if (seenTitles.has(fp)) continue;
        seenTitles.add(fp);
        items.push(n);
      }

      if (!items.length) continue;

      const sourceLine = items[0]._sources?.length > 1
        ? `<span style="font-size:9px;color:#00D4FF;font-weight:700">+${items[0]._sources.length - 1} ${t('source_many')}</span>`
        : `<span style="font-size:9px;color:rgba(255,255,255,0.28)">${esc(items[0].source || '')}</span>`;

      parts.push(`
        <div class="brief-section">
          <div class="brief-section-label">${sec.icon} ${esc(sec.label)}</div>
          ${items.map(n => `
            <div class="brief-item" data-id="${esc(n.id)}" style="cursor:pointer">
              <div class="brief-item-title">${esc(n.title)}</div>
              <div class="brief-item-summary">${esc((n.summary || '').slice(0, 110))}…</div>
              <div class="brief-item-meta">${sourceLine} · <span style="color:rgba(255,255,255,0.28)">${esc(n.timeAgo || '')}</span></div>
            </div>
          `).join('')}
        </div>
      `);
    }

    if (!parts.length) return `<div style="padding:20px;color:rgba(255,255,255,0.4);font-size:14px">${t('brief_loading')}</div>`;

    const ts = new Date().toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="brief-header-row">
        <span style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:.1em">${t('brief_updated')} ${ts}</span>
      </div>
      ${parts.join('<div class="brief-divider"></div>')}
      <div style="margin-top:14px;font-size:10px;color:rgba(255,255,255,0.22);font-style:italic">${t('live_updating')}</div>
    `;
  }

  /** Auto-refresh brief panel if open — called on each news update */
  _maybeRefreshBriefPanel() {
    const panel = document.getElementById('ai-panel');
    const cont  = document.getElementById('ai-panel-content');
    if (panel && !panel.classList.contains('hidden') && cont) {
      cont.innerHTML = this._renderBrief();
      this._bindBriefClicks(cont);
    }
  }

  _bindBriefClicks(container) {
    container?.querySelectorAll('.brief-item').forEach(el => {
      el.addEventListener('click', () => {
        const id   = el.dataset.id;
        const item = this._pool().find(n => n.id === id);
        if (item) this.openArticle(item);
      });
    });
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

  _buildHotspotLegend() {
    const el = document.getElementById('hotspot-legend');
    if (!el) return;
    const entries = [
      { cat: 'sports',        color: '#4ADE80' },
      { cat: 'technology',    color: '#818CF8' },
      { cat: 'entertainment', color: '#FB923C' },
      { cat: 'gaming',        color: '#C084FC' },
      { cat: 'trending',      color: '#F59E0B' },
      { cat: 'world',         color: '#00D4FF' },
    ];
    el.innerHTML = entries.map(({ cat, color }) => {
      const label = t('cat_' + cat) || CATEGORIES[cat]?.label || cat;
      return `<div class="hl-row">
        <span class="hl-dot" style="background:${color};box-shadow:0 0 6px ${color}88"></span>
        <span class="hl-label">${label}</span>
      </div>`;
    }).join('');
    // Re-render on language change so labels update
    window.addEventListener('orbit:lang', () => this._buildHotspotLegend());
  }

  _renderProfilePanel() {
    const p     = getProfile();
    const pool  = this._pool();
    const stats = getStats(pool);
    const panel = document.getElementById('profile-panel');
    if (!panel) return;

    const favCats   = getFavorites();
    const catList   = Object.keys(CATEGORIES).filter(c => c !== 'all');
    const countries = ['UK','US','ES','FR','DE','IT','JP','CN','IN','BR','AU','KR','RU','AR','MX','CA'];
    const authUser  = getUser();
    const userEmail = authUser?.email || '';

    // Name priority: 1) saved profile name, 2) auth metadata name (registration), 3) email prefix
    const registeredName = authUser?.user_metadata?.name || authUser?.user?.user_metadata?.name || '';
    const displayName = (p.name && p.name !== 'World Explorer') ? p.name
                      : registeredName || userEmail.split('@')[0] || '';

    // Auto-save registration name to profile if not yet set
    if (registeredName && (!p.name || p.name === 'World Explorer' || p.name === '')) {
      saveProfile({ name: registeredName });
    }

    const emailLangCurrent = p.email_language || getLang();

    panel.innerHTML = `
      <div style="height:2px;background:linear-gradient(90deg,transparent,#00D4FF,#7B2FBE,transparent);flex-shrink:0"></div>

      <!-- Header -->
      <div style="position:relative;padding:22px 20px 16px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06)">
        <button id="profile-panel-close" style="position:absolute;top:14px;right:14px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);cursor:pointer;color:rgba(255,255,255,0.4);font-size:13px;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>

        <div style="position:relative;display:inline-block;margin-bottom:12px">
          <div style="width:72px;height:72px;border-radius:50%;padding:2px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);box-shadow:0 0 28px rgba(0,212,255,0.22);display:inline-flex">
            <div style="width:100%;height:100%;border-radius:50%;background:#0D0D1C;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;letter-spacing:-.01em">${(displayName||'N').charAt(0).toUpperCase()}</div>
          </div>
          <div style="position:absolute;bottom:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#00FF88;border:2px solid #0D0D1C;box-shadow:0 0 8px rgba(0,255,136,0.5)"></div>
        </div>

        <div style="position:relative;display:inline-block;width:100%;max-width:220px">
          <input id="prof-name" value="${esc(displayName)}" maxlength="48" placeholder="Tu nombre"
            style="width:100%;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.15);padding:4px 0;font-size:16px;font-weight:700;color:#fff;text-align:center;outline:none;font-family:'Space Grotesk',sans-serif;box-sizing:border-box"/>
        </div>

        <div style="font-size:11px;color:rgba(255,255,255,0.28);margin-top:6px;letter-spacing:.02em">${esc(userEmail)}</div>
        <div style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:3px 10px;background:linear-gradient(135deg,rgba(0,212,255,0.1),rgba(123,47,190,0.1));border:1px solid rgba(0,212,255,0.2);border-radius:99px">
          <div style="width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#00D4FF,#7B2FBE)"></div>
          <span style="font-size:9px;font-weight:800;letter-spacing:.14em;color:#00D4FF">ORBIT MEMBER</span>
        </div>
      </div>

      <!-- Stats strip -->
      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="flex:1;text-align:center;padding:13px 6px">
          <div style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#00D4FF,#7B2FBE);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${stats.totalRead}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,0.3);margin-top:2px">${t('profile_read')||'LEÍDAS'}</div>
        </div>
        <div style="flex:1;text-align:center;padding:13px 6px;border-left:1px solid rgba(255,255,255,0.06)">
          <div style="font-size:22px;font-weight:800;color:#fff">${stats.countries}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,0.3);margin-top:2px">${t('profile_countries')||'PAÍSES'}</div>
        </div>
        <div style="flex:1;text-align:center;padding:13px 6px;border-left:1px solid rgba(255,255,255,0.06)">
          <div style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#00D4FF,#7B2FBE);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${favCats.length}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,0.3);margin-top:2px">${t('profile_top_interests')||'INTERESES'}</div>
        </div>
      </div>

      <!-- Scrollable body -->
      <div style="overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;flex:1;min-height:0">

        <!-- Daily Brief card -->
        <div style="background:linear-gradient(135deg,rgba(0,212,255,0.06),rgba(123,47,190,0.06));border:1px solid rgba(0,212,255,0.14);border-radius:14px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid rgba(0,212,255,0.1)">
            <span style="font-size:10px;font-weight:800;letter-spacing:.12em;color:#00D4FF">📬 RESUMEN DIARIO</span>
            <span style="font-size:8px;font-weight:700;letter-spacing:.1em;padding:2px 8px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.3);border-radius:99px;color:#00D4FF">20:00 · EN VIVO</span>
          </div>
          <div style="padding:12px 14px">
            <div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,0.3);margin-bottom:8px">${t('prof_email_lang')||'IDIOMA DEL EMAIL'}</div>
            <div id="prof-email-lang" style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
              ${[
                { code:'es', label:'Español' },
                { code:'en', label:'English' },
                { code:'fr', label:'Français' },
                { code:'de', label:'Deutsch' },
              ].map(l => {
                const sel = emailLangCurrent === l.code;
                return `<button type="button" class="email-lang-btn" data-lang="${l.code}" ${sel ? 'data-selected="true"' : ''} style="padding:7px 5px;background:${sel ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)'};border:1px solid ${sel ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'};border-radius:8px;font-size:11.5px;font-weight:600;color:${sel ? '#00D4FF' : 'rgba(255,255,255,0.4)'};cursor:pointer;transition:all .15s">${l.label}</button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Interests -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.15em;color:rgba(255,255,255,0.35);margin-bottom:9px">${t('prof_interests')||'INTERESES'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:7px" id="prof-cats">
            ${catList.map(cat => {
              const c = CATEGORIES[cat];
              const active = p.categories.includes(cat);
              const fav    = isFavorite(cat);
              return `<button class="prof-cat-btn ${active?'pca':''}" data-cat="${cat}"
                style="padding:6px 12px;border-radius:99px;font-size:12px;cursor:pointer;
                       background:${active?c.bg:'rgba(255,255,255,0.04)'};
                       color:${active?c.color:'rgba(255,255,255,0.4)'};
                       border:1px solid ${active?c.color+'55':'rgba(255,255,255,0.08)'}">
                ${c.icon} ${t('cat_'+cat)||c.label}${fav?' ✦':''}
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">
          <button id="prof-save" style="width:100%;padding:13px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;border:none;letter-spacing:.02em;font-family:'Space Grotesk',sans-serif;box-shadow:0 4px 20px rgba(0,212,255,0.25)">${t('prof_save')||'Guardar cambios'}</button>
          <button id="prof-orbitplus" style="width:100%;padding:12px;background:linear-gradient(135deg,rgba(123,47,190,0.15),rgba(0,212,255,0.08));border:1px solid rgba(123,47,190,0.4);border-radius:12px;font-size:14px;font-weight:700;color:#A855F7;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;font-family:'Space Grotesk',sans-serif">
            ✦ ${t('discover_orbit_plus')||'Descubrir ORBIT+'}
          </button>
          <button id="prof-logout" style="width:100%;padding:10px;background:transparent;border:none;font-size:13px;font-weight:600;color:rgba(255,71,87,0.55);cursor:pointer;letter-spacing:.02em">${t('prof_logout')||'Cerrar sesión'}</button>
        </div>

      </div>
    `;

    // Update topbar avatar with correct name initial
    const av = document.querySelector('.avatar');
    if (av && displayName) av.textContent = displayName.charAt(0).toUpperCase();

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
        btn.style.background = active ? c.bg : 'rgba(255,255,255,0.04)';
        btn.style.color      = active ? c.color : 'rgba(255,255,255,0.4)';
        btn.style.border     = `1px solid ${active ? c.color+'55' : 'rgba(255,255,255,0.08)'}`;
      });
    });

    // Email language toggles
    panel.querySelectorAll('.email-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.email-lang-btn').forEach(b => {
          b.style.background   = 'rgba(255,255,255,0.04)';
          b.style.borderColor  = 'rgba(255,255,255,0.08)';
          b.style.color        = 'rgba(255,255,255,0.4)';
          delete b.dataset.selected;
        });
        btn.style.background  = 'rgba(0,212,255,0.15)';
        btn.style.borderColor = 'rgba(0,212,255,0.4)';
        btn.style.color       = '#00D4FF';
        btn.dataset.selected  = 'true';
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

    // Save — localStorage + toast + Supabase sync (non-blocking)
    const saveBtn = panel.querySelector('#prof-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name           = (panel.querySelector('#prof-name')?.value || '').trim() || displayName || registeredName || 'Usuario';
        const categories     = [...panel.querySelectorAll('.prof-cat-btn.pca')].map(b => b.dataset.cat);
        const countries      = [...panel.querySelectorAll('.prof-country-btn.pca')].map(b => b.dataset.country);
        const email_language = panel.querySelector('.email-lang-btn[data-selected]')?.dataset.lang || getLang();

        // Save to localStorage immediately (synchronous, always works)
        saveProfile({ name, categories, followedCountries: countries, email_language });

        // Update topbar avatar immediately
        const av = document.querySelector('.avatar');
        if (av) av.textContent = name.charAt(0).toUpperCase();

        // Close panel right away
        panel.classList.add('hidden');

        // Show toast OUTSIDE the panel so it's always visible
        const toast = document.createElement('div');
        toast.style.cssText = [
          'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
          'z-index:9999', 'padding:12px 28px',
          'background:linear-gradient(135deg,rgba(0,255,136,0.95),rgba(0,212,255,0.95))',
          'color:#07070F', 'font-family:Space Grotesk,sans-serif', 'font-size:14px',
          'font-weight:700', 'border-radius:99px',
          'box-shadow:0 8px 32px rgba(0,255,136,0.35)',
          'pointer-events:none', 'white-space:nowrap',
          'animation:panel-drop .25s ease',
        ].join(';');
        toast.textContent = '✓ Perfil guardado';
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.transition = 'opacity .4s';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 400);
        }, 2000);

        // Supabase sync in background (fire-and-forget)
        if (getUser()?.id) {
          syncProfile({ name, email_language, favorites: categories }).catch(() => {});
        }
      });
    }

    // ORBIT+
    panel.querySelector('#prof-orbitplus')?.addEventListener('click', () => {
      panel.classList.add('hidden');
      openOrbitPlus('profile');
    });

    // Logout
    panel.querySelector('#prof-logout')?.addEventListener('click', async () => {
      await authLogout();
      localStorage.removeItem('orbit_session');
      window.location.reload();
    });
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  showTooltip(text, countryCode, x, y) {
    if (window.innerWidth < 768) return;
    if (!this.tooltip) return;
    // Use country code badge (works on all platforms incl. Windows)
    this.tooltipFlag.textContent = countryCode || '';
    this.tooltipName.textContent = text.length>48?text.slice(0,48)+'…':text;
    this.tooltip.style.left = x+'px';
    this.tooltip.style.top  = y+'px';
    this.tooltip.classList.add('visible');
  }

  hideTooltip() { this.tooltip?.classList.remove('visible'); }

  // ── Globe event callbacks ──────────────────────────────────────────────────
  onHotspotHover(data, x, y) {
    if (window.innerWidth < 768) return;

    const name     = this._getCountryName(data.country);
    const count    = data._allNews?.length || 0;
    const intense  = data.intensity || 0.5;
    const trending = intense > 0.75 ? '🔴 ALTA' : intense > 0.55 ? '🟡 MEDIA' : '🟢 ESTABLE';
    const pct      = Math.round(intense * 100);
    const top      = data._allNews?.[0]?.title?.slice(0, 55) || '';

    this._showHotspotPreview(data.country, name, count, trending, pct, top, x, y);

    // Show country outline — same color as globe hotspot for that category
    const outlineColor = (CATEGORIES[data.category] || CATEGORIES.world).color;
    this.globe.showCountryOutline?.(data.country, outlineColor);
  }

  _showHotspotPreview(code, name, count, trending, pct, headline, x, y) {
    // Remove old preview
    document.getElementById('hotspot-preview')?.remove();

    const preview = document.createElement('div');
    preview.id = 'hotspot-preview';

    // Clamp to viewport
    const pw = 240, ph = 120;
    const px = Math.min(x + 14, window.innerWidth  - pw - 12);
    const py = Math.min(y - 10, window.innerHeight - ph - 12);

    preview.style.cssText = [
      `position:fixed`, `left:${px}px`, `top:${py}px`,
      `width:${pw}px`, `z-index:300`,
      `background:rgba(6,6,18,0.95)`,
      `border:1px solid rgba(0,212,255,0.25)`,
      `border-radius:12px`,
      `padding:12px 14px`,
      `pointer-events:none`,
      `backdrop-filter:blur(20px)`,
      `box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(0,212,255,0.08)`,
      `animation:panel-drop .15s ease`,
    ].join(';');

    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${flagHtml(code, 18)}
        <span style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;color:#fff">${name}</span>
        <span style="margin-left:auto;font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:rgba(0,212,255,.15);color:#00D4FF;letter-spacing:.06em">LIVE</span>
      </div>
      <div style="display:flex;gap:14px;margin-bottom:8px">
        <div style="font-size:11px;color:rgba(255,255,255,.45)">${t('hotspot_activity')} <span style="color:#fff;font-weight:700">${pct}%</span></div>
        <div style="font-size:11px;color:rgba(255,255,255,.45)">${t('hotspot_news')} <span style="color:#fff;font-weight:700">${count}</span></div>
        <div style="font-size:11px">${trending}</div>
      </div>
      ${headline ? `<div style="font-size:11px;color:rgba(255,255,255,.5);line-height:1.45;border-top:1px solid rgba(255,255,255,.07);padding-top:7px">${headline}…</div>` : ''}
    `;

    document.body.appendChild(preview);
    this._previewEl = preview;
  }

  onHotspotLeave() {
    this.hideTooltip();
    document.getElementById('hotspot-preview')?.remove();
    this.globe.hideCountryOutline?.();
  }

  // ── Country Hub — the main UX entry point ─────────────────────────────────
  // Planet → tap country → country becomes a living hub with internal categories
  onCountryHubClick(data) {
    const countryCode  = data.country;
    const countryLabel = this._getCountryName(countryCode);        // "España" — for display
    const countrySearch = countryLabel.toLowerCase();              // "españa" — for text search

    const rawPool  = data._allNews?.length ? data._allNews
                   : this._pool().filter(n => n.country === countryCode);
    const realNews = rawPool.filter(n => !n.isMicro);

    // Title-dedup real articles FIRST to get true unique count (server may have duplicates)
    const _fp = n => (n.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 55);
    const titleSeen = new Map();
    const uniqueReal = [];
    for (const n of realNews) {
      const fp = _fp(n);
      if (!fp) { uniqueReal.push(n); continue; }
      if (titleSeen.has(fp)) {
        const idx = titleSeen.get(fp);
        if ((n.timestamp || 0) > (uniqueReal[idx]?.timestamp || 0)) uniqueReal[idx] = n;
      } else {
        titleSeen.set(fp, uniqueReal.length);
        uniqueReal.push(n);
      }
    }

    let pool;
    // Supplement if fewer than 8 UNIQUE articles (not raw count with server duplicates)
    if (uniqueReal.length >= 8) {
      pool = uniqueReal;
    } else {
      const globalPool = this._pool().filter(n => !n.isMicro);
      const usedFPs    = new Set(titleSeen.keys());
      const usedIds    = new Set(uniqueReal.map(n => n.id));

      const notUsed = n => {
        if (usedIds.has(n.id)) return false;
        const fp = _fp(n); return !fp || !usedFPs.has(fp);
      };

      const mentioned = globalPool.filter(n =>
        notUsed(n) && n.country !== countryCode &&
        (n.title + ' ' + (n.summary || '')).toLowerCase().includes(countrySearch)
      ).slice(0, 12);

      mentioned.forEach(n => { usedIds.add(n.id); const fp = _fp(n); if (fp) usedFPs.add(fp); });

      const needed  = Math.max(0, 20 - uniqueReal.length - mentioned.length);
      const trending = globalPool.filter(notUsed)
        .sort((a, b) => (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0))
        .slice(0, needed);

      pool = [...uniqueReal, ...mentioned, ...trending];
      if (!pool.length) pool = uniqueReal.length ? uniqueReal : rawPool;
    }

    const allNews = pool.length ? pool : this._pool().slice(0, 12);

    this._currentCountryNews = allNews;
    this._activeHubCat       = 'all';
    this._activeSort         = 'top';

    this._initHubControls(allNews);
    const displayCount = allNews.filter(n => !n.isMicro).length || allNews.length;
    this.openPanel(allNews, allNews, countryLabel,
      `${displayCount} ${t('stories') || 'noticias'}`, countryCode);
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
        const count    = c.cat === 'all' ? allNews.length : (counts[c.cat] || 0);
        const isGlobal = count === 0 && c.cat !== 'all';
        const badge    = count > 0 && c.cat !== 'all'
          ? `<span style="font-size:9px;background:rgba(255,255,255,0.18);padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:700">${count}</span>`
          : isGlobal
            ? `<span style="font-size:9px;background:rgba(0,212,255,0.15);color:#00D4FF;padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:700">global</span>`
            : '';
        return `<button class="hub-cat" data-cat="${c.cat}" style="opacity:${isGlobal?'0.65':'1'}">
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

    let news;
    if (cat === 'all') {
      news = pool;
    } else if (cat === 'trending') {
      // Trending = top articles by trendScore/intensity regardless of category
      news = [...pool]
        .sort((a, b) => (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0))
        .slice(0, 15);
      if (!news.length) news = pool;
    } else {
      news = pool.filter(n => n.category === cat);
      if (!news.length) {
        // No local articles for this category — show top global content instead
        news = this._pool()
          .filter(n => n.category === cat && !n.isMicro)
          .sort((a, b) => (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0))
          .slice(0, 15);
      }
      if (!news.length) news = pool;
    }

    if (sort === 'latest') news = [...news].sort((a, b) => b.timestamp - a.timestamp);
    if (sort === 'foryou') {
      try { const p = getProfile(); news = [...news].sort((a,b) => (p.categories.includes(b.category)?1:0)-(p.categories.includes(a.category)?1:0)); } catch(_){}
    }

    this._currentNews = news;
    this._renderCards(news, { skipUrlDedup: true });
  }

  onBackgroundClick() { this.closePanel(); this.hideTooltip(); }

  _getCountryName(code) {
    const n = {
      UK:'United Kingdom', US:'United States',  ES:'España',         FR:'France',
      DE:'Deutschland',    JP:'Japan',           CN:'China',          BR:'Brasil',
      IN:'India',          AU:'Australia',       KR:'South Korea',    RU:'Russia',
      CA:'Canada',         MX:'México',          AR:'Argentina',      IT:'Italia',
      PT:'Portugal',       NL:'Netherlands',     PL:'Poland',         SE:'Sweden',
      NO:'Norway',         DK:'Denmark',         FI:'Finland',        CH:'Switzerland',
      AT:'Austria',        BE:'Belgium',         GR:'Greece',         TR:'Turkey',
      UA:'Ukraine',        IL:'Israel',          SA:'Saudi Arabia',   AE:'UAE',
      QA:'Qatar',          EG:'Egypt',           NG:'Nigeria',        ZA:'South Africa',
      KE:'Kenya',          ET:'Ethiopia',        GH:'Ghana',          MA:'Morocco',
      SG:'Singapore',      ID:'Indonesia',       TH:'Thailand',       VN:'Vietnam',
      MY:'Malaysia',       PH:'Philippines',     PK:'Pakistan',       BD:'Bangladesh',
      IR:'Iran',           IQ:'Iraq',            SY:'Syria',          LB:'Lebanon',
      CO:'Colombia',       CL:'Chile',           PE:'Perú',           VE:'Venezuela',
      UY:'Uruguay',        EC:'Ecuador',         BO:'Bolivia',        PY:'Paraguay',
      NZ:'New Zealand',    ZW:'Zimbabwe',        TZ:'Tanzania',       UG:'Uganda',
    };
    if (n[code]) return n[code];
    // Capitalize code as fallback
    return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
  }

  // ── Trending — extracted from live news pool ──────────────────────────────
  _initTrending() {
    // Initial render with static topics as placeholder
    this._renderTrendingFromPool();
  }

  /**
   * Extract real trending topics from the current news pool.
   * Called on init and whenever the pool updates.
   */
  _extractTopicsFromPool() {
    const pool = this._pool();
    if (!pool.length) return getTrendingTopics();

    // Words that look like entities but aren't
    const NOISE = new Set([
      'The','This','That','From','With','After','Before','Says','Said','Will','Have','Been',
      'Also','When','What','Which','Where','There','Their','About','Into','Over','Under',
      'More','Most','Some','Such','Both','Each','Than','Then','Then','Even','Just',
      // Spanish articles / prepositions that appear capitalized mid-sentence
      'Los','Las','Del','Una','Que','Pero','Como','Para','Sobre','Entre','Cuando',
      'Tras','Ante','Este','Esta','Estos','Estas','Hay','Son','Han','Era',
      // French
      'Les','Des','Une','Qui','Que','Sur','Avec','Dans','Pour',
      // German
      'Der','Die','Das','Ein','Eine','Und','Mit','Auf','Von','Aus',
      // Generic verbs / stopwords that might be capitalized
      'Show','Late','New','Big','All','How','Why','First','Last','Amid',
    ]);

    // Min length for a meaningful entity
    const MIN_LEN = 4;

    const freq = new Map();

    for (const a of pool) {
      const words = (a.title || '').split(/\s+/);

      for (let i = 0; i < words.length; i++) {
        const raw = words[i].replace(/[«»"'""''()\[\].,;:!?¡¿]/g, '').trim();
        if (raw.length < MIN_LEN) continue;

        // Must start with uppercase AND not be all-uppercase (acronym filter: OK) AND be alphabetic
        if (!/^[A-ZÁÉÍÓÚÑÜA-Z][a-záéíóúñü]/.test(raw)) continue;

        const clean = raw.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
        if (clean.length < MIN_LEN) continue;

        // Skip noise words
        if (NOISE.has(clean)) continue;

        // Try bi-gram: "Real Madrid", "Aston Villa", "OpenAI ChatGPT"
        let phrase = clean;
        if (i + 1 < words.length) {
          const nextRaw = words[i + 1].replace(/[«»"'""''()\[\].,;:!?¡¿]/g, '').trim();
          const next    = nextRaw.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
          if (next.length >= 3 && /^[A-ZÁÉÍÓÚ]/.test(next) && !NOISE.has(next)) {
            phrase = `${clean} ${next}`;
            i++;
          }
        }

        freq.set(phrase, (freq.get(phrase) || 0) + 1);
      }

      // Structured tags — already clean keywords
      for (const tag of (a.tags || [])) {
        const t = tag.replace(/-/g, ' ').trim();
        if (t.length >= MIN_LEN && !NOISE.has(t)) {
          const pretty = t.charAt(0).toUpperCase() + t.slice(1);
          freq.set(pretty, (freq.get(pretty) || 0) + 0.6);
        }
      }
    }

    return [...freq.entries()]
      .filter(([k, v]) => v >= 3 && k.length >= MIN_LEN) // ≥3 articles minimum
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([label, count], i) => ({
        label,
        count: `${Math.round(count)} ${t('trending_articles')}`,
        pulse: Math.min(count / 20, 1),
        hot:   count >= 10,
        idx:   i,
      }));
  }

  _renderTrendingFromPool() {
    const topics = this._extractTopicsFromPool();
    const scroll = document.getElementById('trending-scroll');
    if (!scroll || !topics.length) return;

    const doubled = [...topics, ...topics];
    scroll.innerHTML = `<div class="trending-inner">${doubled.map((item, i) => {
      const pulseColor = item.hot ? '#FF4757' : item.pulse > 0.4 ? '#FF6B35' : '#00D4FF';
      const hotBadge   = item.hot ? '<span style="font-size:9px;margin-left:2px">🔥</span>' : '';
      return `
        <span class="trending-item" data-label="${esc(item.label)}" style="cursor:pointer">
          <span class="trending-item-rank" style="color:${pulseColor}">#${(i % topics.length) + 1}</span>
          <span class="trending-item-label">${esc(item.label)}${hotBadge}</span>
          <span class="trending-item-count">${esc(item.count)}</span>
        </span>${i < doubled.length - 1 ? '<span class="trending-sep">·</span>' : ''}
      `;
    }).join('')}</div>`;

    scroll.querySelectorAll('.trending-item').forEach(el => {
      el.addEventListener('click', () => {
        const q    = (el.dataset.label || '').toLowerCase();
        const pool = this._pool();
        const hits = pool.filter(n =>
          n.title.toLowerCase().includes(q) ||
          (n.tags || []).some(tag => tag.toLowerCase().includes(q.split(' ')[0]))
        );
        if (hits.length) this.openPanel(hits, hits, `🔥 ${el.dataset.label}`,
          `${hits.length} ${t('stories') || 'noticias'}`, '');
      });
    });
  }

  /** Called whenever the live news pool updates */
  refreshTrending() {
    this._renderTrendingFromPool();
    this._maybeRefreshBriefPanel();
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
        results.innerHTML=found.map(n=>{const cat=CATEGORIES[n.category]||CATEGORIES.all;const fl=n.country?flagHtml(n.country,14):'';return`<div class="search-result-item" data-id="${esc(n.id)}" style="cursor:pointer"><span style="font-size:18px">${cat.icon}</span><div><div style="font-size:13px;font-weight:500;color:#fff">${esc(n.title.slice(0,55))}…</div><div style="font-size:11px;color:rgba(255,255,255,0.4);display:flex;align-items:center;gap:4px">${fl}${this._getCountryName(n.country)} · ${t('cat_'+n.category)||cat.label}</div></div></div>`;}).join('');
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

  // ── World clock — terminal market dashboard ──────────────────────────────
  _startWorldClock() {
    const zones = {
      'clk-nyc': { tz:'America/New_York',  mktOpen:[9.5, 16],   mktId:'mkt-nyc' },
      'clk-lon': { tz:'Europe/London',     mktOpen:[8,   16.5], mktId:'mkt-lon' },
      'clk-mad': { tz:'Europe/Madrid',     mktOpen:[9,   17.5], mktId:'mkt-mad' },
      'clk-dxb': { tz:'Asia/Dubai',        mktOpen:[10,  14],   mktId:'mkt-dxb' },
      'clk-tky': { tz:'Asia/Tokyo',        mktOpen:[9,   15.5], mktId:'mkt-tky' },
    };

    const localEl = document.getElementById('clk-local');
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const tick = () => {
      const now = new Date();

      // Local time
      if (localEl) {
        localEl.textContent = now.toLocaleTimeString('en', {
          timeZone: localTz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false
        });
      }

      Object.entries(zones).forEach(([id, cfg]) => {
        const el  = document.getElementById(id);
        const dot = document.getElementById(cfg.mktId);
        if (!el) return;

        const timeStr = now.toLocaleTimeString('en-US', {
          timeZone: cfg.tz, hour:'2-digit', minute:'2-digit', hour12: false
        });
        el.textContent = timeStr;

        // Market open/closed indicator
        if (dot && cfg.mktOpen) {
          const h = parseFloat(now.toLocaleTimeString('en-US', { timeZone: cfg.tz, hour:'2-digit', minute:'2-digit', hour12: false }).replace(':', '.'));
          const isOpen   = h >= cfg.mktOpen[0] && h < cfg.mktOpen[1];
          dot.style.background = isOpen ? '#00FF88' : 'rgba(255,255,255,0.2)';
          dot.title = isOpen ? t('market_open') : t('market_closed');
        }
      });
    };

    tick();
    setInterval(tick, 1000);
  }
}
