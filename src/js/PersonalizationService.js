// ════════════════════════════════════════════════════════
//  ORBIT — Personalization Service
//  Stores preferences in localStorage and scores news
// ════════════════════════════════════════════════════════

const KEY   = 'orbit_profile_v2';
const READS = 'orbit_reads_v2';

const DEFAULT_PROFILE = {
  name:              '',
  avatar:            null,
  categories:        ['sports', 'technology', 'world'],
  followedCountries: [],
  language:          'en',
  notifications:     true,
  createdAt:         Date.now(),
};

// ─── Read / Write ─────────────────────────────────────────────────────────────
export function getProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_PROFILE, ...saved };
  } catch(_) { return { ...DEFAULT_PROFILE }; }
}

export function saveProfile(updates) {
  const current = getProfile();
  const next = { ...current, ...updates };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('orbit:profile', { detail: next }));
  return next;
}

// ─── Reading history ──────────────────────────────────────────────────────────
let _reads = null;
function getReads() {
  if (_reads) return _reads;
  try { _reads = new Set(JSON.parse(localStorage.getItem(READS) || '[]')); }
  catch(_) { _reads = new Set(); }
  return _reads;
}

export function markRead(articleId) {
  const r = getReads();
  r.add(articleId);
  _reads = r;
  // Keep last 500 reads
  const arr = [...r].slice(-500);
  localStorage.setItem(READS, JSON.stringify(arr));
}

export function isRead(articleId) { return getReads().has(articleId); }

export function getReadCount() { return getReads().size; }

// ─── Personalized scoring ─────────────────────────────────────────────────────
export function scoreArticle(article, profile) {
  let score = (article.intensity || 0.5) * 100;

  // Category bonus — preferred categories get 2× boost
  if (profile.categories.includes(article.category)) score += 50;

  // Followed country bonus — strong signal
  if (profile.followedCountries.includes(article.country)) score += 80;

  // Recency — exponential decay, articles lose 5pts per hour
  const hoursOld = (Date.now() - (article.timestamp || 0)) / 3_600_000;
  score -= hoursOld * 5;

  // Already read — heavy penalty so variety is maintained
  if (isRead(article.id)) score -= 200;

  return score;
}

export function getPersonalizedFeed(news, profile) {
  return [...news]
    .map(n => ({ ...n, _score: scoreArticle(n, profile) }))
    .sort((a, b) => b._score - a._score);
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export function getStats(news) {
  const reads    = getReads();
  const profile  = getProfile();
  const readNews = news.filter(n => reads.has(n.id));
  const catMap   = {};
  readNews.forEach(n => { catMap[n.category] = (catMap[n.category] || 0) + 1; });
  const topCat   = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
  const countries = new Set(readNews.map(n => n.country)).size;

  // Reading streak (simplified: based on localStorage date)
  const lastDate = localStorage.getItem('orbit_last_read_date');
  const today    = new Date().toDateString();
  if (lastDate !== today) localStorage.setItem('orbit_last_read_date', today);
  const streak   = parseInt(localStorage.getItem('orbit_streak') || '1');

  return {
    totalRead:   reads.size,
    countries,
    topCategory: topCat,
    streak,
  };
}

// ─── Profile is set up? ───────────────────────────────────────────────────────
export function isOnboarded() {
  const p = getProfile();
  return p.categories.length > 0 || p.followedCountries.length > 0;
}
