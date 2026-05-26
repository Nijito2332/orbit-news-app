// ════════════════════════════════════════════════════════
//  ORBIT — Pulse Engine
//  Real-time trending topics from public RSS feeds.
//  No paid APIs — Reddit, HN, Guardian tags, BBC.
//  Runs every 5 minutes, stores scored trend list.
// ════════════════════════════════════════════════════════

import fetch from 'node-fetch';

// ── Source definitions ────────────────────────────────────────────────────────
const RSS_SOURCES = [
  // World news
  { url: 'https://feeds.bbci.co.uk/news/rss.xml',                cat: 'world',         weight: 0.9 },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',          cat: 'world',         weight: 0.9 },
  { url: 'https://rss.dw.com/rdf/rss-en-all',                    cat: 'world',         weight: 0.8 },
  // Tech
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',     cat: 'technology',    weight: 0.85 },
  { url: 'https://news.ycombinator.com/rss',                      cat: 'technology',    weight: 0.75 },
  // Sports
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml',               cat: 'sports',        weight: 0.85 },
  // Entertainment
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', cat: 'entertainment', weight: 0.8 },
  // Gaming (via BBC Tech + filter)
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',     cat: 'gaming',        weight: 0.5 },
];

// Stop-words to ignore when extracting topic keywords
const STOPS = new Set([
  'the','a','an','is','are','was','were','in','on','at','to','of','and','or',
  'that','this','it','its','for','with','from','by','as','be','been','have',
  'has','had','he','she','they','we','you','but','not','more','says','said',
  'after','new','first','world','over','how','who','why','what','will','one',
  'year','years','up','out','into','than','also','can','about','all','when',
  'which','their','there','so','do','did','news','latest','breaking'
]);

// Source authority weights (higher = more trustworthy trend signal)
const AUTHORITY = {
  'bbc.co.uk':       0.95,
  'theguardian.com': 0.90,
  'reuters.com':     0.95,
  'ycombinator.com': 0.75,
  'dw.com':          0.80,
};

// ── Trend store ───────────────────────────────────────────────────────────────
let _trends      = [];
let _lastFetch   = 0;
let _prevCounts  = {};    // previous window mention counts (for velocity)

// ── RSS parsing (lightweight — no xml2js dependency) ─────────────────────────
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title  = (/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(block) ||
                    /<title[^>]*>([\s\S]*?)<\/title>/.exec(block))?.[1] || '';
    const desc   = (/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(block) ||
                    /<description[^>]*>([\s\S]*?)<\/description>/.exec(block))?.[1] || '';
    const link   = (/<link[^>]*>([\s\S]*?)<\/link>/.exec(block))?.[1]?.trim() || '';
    const pubDate= (/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/.exec(block))?.[1] || '';

    if (title.length > 5) {
      items.push({
        title:   title.replace(/<[^>]+>/g, '').trim(),
        desc:    desc.replace(/<[^>]+>/g, '').trim().slice(0, 200),
        link,
        pubDate: pubDate ? new Date(pubDate).getTime() : Date.now(),
      });
    }
  }
  return items;
}

// ── Keyword extraction from title ────────────────────────────────────────────
function extractKeywords(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPS.has(w))
    .slice(0, 6);
}

// Jaccard similarity between two keyword sets
function jaccardSim(setA, setB) {
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union  = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

// ── Authority score from URL ──────────────────────────────────────────────────
function authorityScore(url) {
  for (const [domain, score] of Object.entries(AUTHORITY)) {
    if (url.includes(domain)) return score;
  }
  return 0.5;
}

// ── Fetch one RSS feed safely ─────────────────────────────────────────────────
async function fetchFeed(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'ORBIT/1.0 News Aggregator' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml).map(item => ({
      ...item,
      cat:       source.cat,
      authority: authorityScore(item.link || source.url) * source.weight,
      source:    source.url,
    }));
  } catch (_) { return []; }
}

// ── Cluster articles into topic groups ───────────────────────────────────────
function clusterIntoTopics(articles) {
  const clusters = [];

  for (const art of articles) {
    const kws = new Set(extractKeywords(art.title));
    if (!kws.size) continue;

    // Find best matching cluster
    let best = null, bestScore = 0;
    for (const cl of clusters) {
      const score = jaccardSim(kws, cl.keywords);
      if (score > 0.35 && score > bestScore) { best = cl; bestScore = score; }
    }

    if (best) {
      best.articles.push(art);
      best.authority  = Math.max(best.authority, art.authority);
      best.cats.add(art.cat);
      // Merge keywords (intersection keeps stable canonical)
      kws.forEach(w => best.keywords.add(w));
      // Prefer more authoritative title as label
      if (art.authority > best.topAuthority) {
        best.label = art.title;
        best.topAuthority = art.authority;
      }
    } else {
      clusters.push({
        label:        art.title,
        keywords:     kws,
        articles:     [art],
        authority:    art.authority,
        topAuthority: art.authority,
        cats:         new Set([art.cat]),
      });
    }
  }
  return clusters;
}

// ── Compute pulse score for each cluster ─────────────────────────────────────
function scoreClusters(clusters) {
  const now = Date.now();
  return clusters.map(cl => {
    const count = cl.articles.length;
    const canonical = cl.label.slice(0, 60).replace(/\s+/g, ' ').trim();

    // Velocity: growth vs previous window
    const prev     = _prevCounts[canonical] || 0;
    const velocity = Math.max(0, (count - prev) / Math.max(prev, 1));

    // Freshness: how recent are the articles
    const newest   = Math.max(...cl.articles.map(a => a.pubDate || 0));
    const ageMs    = now - newest;
    const freshness = Math.max(0, 1 - ageMs / (3 * 3600000)); // 3h window

    // Source diversity: more sources = more real
    const srcSet   = new Set(cl.articles.map(a => a.source));
    const diversity = Math.min(srcSet.size / 4, 1);

    // Spam guard: if >70% from one source, penalize
    const srcCounts = {};
    cl.articles.forEach(a => { srcCounts[a.source] = (srcCounts[a.source] || 0) + 1; });
    const maxConc   = Math.max(...Object.values(srcCounts)) / count;
    const spamGate  = maxConc > 0.7 ? 0.5 : 1.0;

    // Geographic spread via categories (proxy for global impact)
    const geoSpread = Math.min([...cl.cats].length / 3, 1);

    const pulse = (
      velocity    * 0.30 +
      freshness   * 0.25 +
      diversity   * 0.20 +
      cl.authority* 0.15 +
      geoSpread   * 0.10
    ) * spamGate;

    _prevCounts[canonical] = count;

    return {
      id:        `trend-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label:     canonical,
      count,
      pulse:     Math.min(1, Math.max(0, pulse)),
      velocity,
      freshness,
      category:  [...cl.cats][0] || 'world',
      hot:       pulse > 0.6,
      isNew:     prev === 0,
    };
  });
}

// ── Main refresh function ─────────────────────────────────────────────────────
export async function refreshTrends() {
  console.log('[Pulse] Refreshing trends…');
  try {
    const allArticles = (
      await Promise.all(RSS_SOURCES.map(fetchFeed))
    ).flat();

    if (allArticles.length < 5) {
      console.warn('[Pulse] Too few articles fetched, skipping update');
      return;
    }

    const clusters = clusterIntoTopics(allArticles);
    const scored   = scoreClusters(clusters)
      .filter(t => t.count >= 1 && t.label.length > 10)
      .sort((a, b) => b.pulse - a.pulse)
      .slice(0, 40);

    _trends    = scored;
    _lastFetch = Date.now();
    console.log(`[Pulse] ${_trends.length} trends computed from ${allArticles.length} articles`);
  } catch (err) {
    console.error('[Pulse] Error:', err.message);
  }
}

export function getTrends(limit = 20) {
  return _trends.slice(0, limit);
}

export function getLastFetch() { return _lastFetch; }

// ── Auto-refresh every 5 minutes ─────────────────────────────────────────────
export function startPulseEngine() {
  refreshTrends();
  setInterval(refreshTrends, 5 * 60 * 1000);
}
