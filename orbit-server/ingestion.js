// ════════════════════════════════════════════════════════
//  ORBIT Server — Continuous Ingestion Engine
//  Runs FOREVER: fetch → process → broadcast
//  Cycle: 90 seconds
// ════════════════════════════════════════════════════════

import fetch from 'node-fetch';
import Parser from 'rss-parser';
import { GUARDIAN_API, GUARDIAN_KEY, GUARDIAN_BULK, RSS_SOURCES, SERVER_ONLY_FEEDS } from './sources.js';
import { detectCountry, coordsFor, clusterArticles, scoreArticles, ensureDensity, generateAISummary } from './pipeline.js';
import { globalBalance } from './globalBalancer.js';
import { store } from './store.js';

const parser = new Parser({ timeout: 8000, headers: { 'User-Agent': 'ORBIT News Engine/1.0' } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function strip(h) {
  return (h||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#?\w+;/g,' ').replace(/\s+/g,' ').trim();
}

function timeAgo(d) {
  if (!d) return '';
  const h = (Date.now()-new Date(d))/3_600_000;
  if (h<1) return `${Math.round(h*60)}m ago`;
  if (h<24) return `${Math.round(h)}h ago`;
  return `${Math.round(h/24)}d ago`;
}

const SEC_CAT = {
  sport:'sports',football:'sports',tennis:'sports',cycling:'sports',boxing:'sports',
  'rugby-union':'sports',golf:'sports',cricket:'sports',
  film:'entertainment',music:'entertainment',television:'entertainment',
  culture:'entertainment',arts:'entertainment',stage:'entertainment',lifeandstyle:'entertainment',
  games:'gaming',
  technology:'technology',science:'technology',environment:'technology',
  world:'world','us-news':'world','uk-news':'world',politics:'world',business:'world',money:'world',
};

function detectCat(sectionId, tags=[]) {
  const sc = SEC_CAT[sectionId]; if (sc) return sc;
  for (const t of tags) {
    if (/^sport|^football/.test(t)) return 'sports';
    if (/^technology/.test(t)) return 'technology';
    if (/^games/.test(t)) return 'gaming';
    if (/^film|^music|^television/.test(t)) return 'entertainment';
    if (/^science|^environment/.test(t)) return 'technology';
  }
  return 'world';
}

// ─── Guardian bulk fetch ───────────────────────────────────────────────────────
async function fetchGuardian() {
  const all = [];
  await Promise.allSettled(GUARDIAN_BULK.map(async q => {
    const url = `${GUARDIAN_API}/search?api-key=${GUARDIAN_KEY}&section=${q.sections}&page-size=${q.size}&order-by=newest&show-fields=trailText&show-tags=keyword`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return;
    const data = await res.json();
    const articles = data.response?.results || [];
    for (const a of articles) {
      const tags    = (a.tags||[]).map(t=>t.id);
      const country = detectCountry(tags, a.webTitle, a.fields?.trailText||'');
      const cat     = q.category;
      const finalCountry = country || (cat === 'sports' ? ['UK','ES','DE','FR','US'][Math.floor(Math.random()*5)] : ['US','UK','FR','DE','JP'][Math.floor(Math.random()*5)]);
      const coords  = coordsFor(finalCountry);
      all.push({
        id:        a.id,
        title:     a.webTitle,
        summary:   strip(a.fields?.trailText||''),
        content:   a.webUrl ? `<a href="${a.webUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:99px;font-size:13px;font-weight:600;color:#fff;text-decoration:none">Read full article →</a>` : '',
        category:  cat,
        country:   finalCountry,
        lat:       coords.lat,
        lng:       coords.lng,
        intensity: 0.5 + Math.random()*0.5,
        timestamp: new Date(a.webPublicationDate).getTime(),
        timeAgo:   timeAgo(a.webPublicationDate),
        source:    'The Guardian',
        url:       a.webUrl,
        tags:      tags.slice(0,5).map(t=>t.split('/').pop()),
        readTime:  '3 min',
        trend:     Math.random()>0.4?'rising':'stable',
        lang:      'en',
        sourceCount: 1,
      });
    }
  }));
  return all;
}

// ─── RSS feed fetch ────────────────────────────────────────────────────────────
async function fetchRSSFeed(feed) {
  let items = [];
  try {
    const parsed = await parser.parseURL(feed.url);
    items = parsed.items || [];
  } catch(_) { return []; }

  return items.slice(0, 10).map((item, i) => {  // 10 items per feed — safe on Fly.io 1GB
    const title = strip(item.title || '');
    if (!title || title.length < 5) return null;
    const coords = coordsFor(feed.country);
    const pub    = item.pubDate || item.isoDate || '';
    const url    = (item.link || item.guid || '').split('?')[0].trim();
    return {
      // ID: URL-based if available (survives across BBC Sport/Football variants),
      // falls back to normalized title (stable across re-fetches)
      id: url
        ? `url-${url}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 120)
        : `rss-${title.slice(0, 60)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 120),
      title,
      summary:   strip(item.contentSnippet || item.summary || item.content || '').slice(0, 300),
      content:   item.link ? `<a href="${item.link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:99px;font-size:13px;font-weight:600;color:#fff;text-decoration:none">Read full article →</a>` : '',
      category:  feed.cat,
      country:   feed.country,
      lat:       coords.lat,
      lng:       coords.lng,
      intensity: 0.45 + Math.random()*0.5,
      timestamp: pub ? new Date(pub).getTime() : Date.now() - i*2_400_000,
      timeAgo:   pub ? timeAgo(pub) : `${i*2+1}h ago`,
      source:    feed.src,
      url:       item.link || '',
      tags:      [feed.cat, feed.country.toLowerCase()],
      readTime:  '2 min',
      trend:     Math.random()>0.4?'rising':'stable',
      lang:      feed.lang || 'en',
      sourceCount: 1,
    };
  }).filter(Boolean);
}

async function fetchAllRSS() {
  const all = [];
  const allFeeds = [...SERVER_ONLY_FEEDS, ...RSS_SOURCES];

  // Fetch in batches of 15 to avoid memory spike from 90+ concurrent requests
  const BATCH = 15;
  for (let i = 0; i < allFeeds.length; i += BATCH) {
    const batch = allFeeds.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(f => fetchRSSFeed(f)));
    results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
  }
  return all;
}

// ─── Full ingestion cycle ──────────────────────────────────────────────────────
export async function runIngestionCycle(broadcast) {
  const start = Date.now();
  console.log('[Ingestion] Starting cycle…');

  const [gResult, rResult] = await Promise.allSettled([
    fetchGuardian(),
    fetchAllRSS(),
  ]);

  let raw = [
    ...(gResult.status === 'fulfilled' ? gResult.value : []),
    ...(rResult.status === 'fulfilled' ? rResult.value : []),
  ];

  // Hard cap: deduplicateArticles is O(n²) in memory.
  // 2000² = 4M comparisons → ~80MB peak — safe on Fly.io 1GB.
  if (raw.length > 2000) {
    raw.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    raw = raw.slice(0, 2000);
  }

  const heapMB = Math.round(process.memoryUsage().heapUsed / 1_048_576);
  console.log(`[Ingestion] ${raw.length} raw articles | heap ${heapMB}MB | ${((Date.now()-start)/1000).toFixed(1)}s`);

  // AI Pipeline — null raw immediately after use so GC can reclaim before O(n²) dedup
  const clustered = clusterArticles(raw); raw = null;
  const scored    = scoreArticles(clustered);
  const dense     = ensureDensity(scored);
  const balanced  = globalBalance(dense);

  // Optional: AI summaries for top clusters
  if (process.env.GROQ_KEY) {
    const topClusters = dense.filter(s => (s._clusterSize||1) >= 3).slice(0, 10);
    for (const story of topClusters) {
      const aiSummary = await generateAISummary([story.title], story.category, story.country);
      if (aiSummary) story.aiSummary = aiSummary;
    }
  }

  // Merge into store and broadcast new stories
  const newStories = store.merge(balanced);

  const stats = store.getStats();
  console.log(`[Store] ${stats.total} stories | ${stats.countries} countries | ${newStories.length} new | ${((Date.now()-start)/1000).toFixed(1)}s total`);

  if (newStories.length > 0 && broadcast) {
    broadcast({ type: 'update', stories: newStories, stats });
  }

  return { total: stats.total, newCount: newStories.length };
}

// ─── CONTINUOUS INGESTION LOOP — runs forever ─────────────────────────────────
const CYCLE_MS = 3 * 60_000; // 3 minutes — Fly.io 1GB handles faster cycles

export async function startIngestionLoop(broadcast) {
  console.log('[ORBIT Engine] Starting continuous ingestion loop…');

  // Delay first cycle 15s so healthcheck passes before memory-intensive work starts
  await new Promise(r => setTimeout(r, 15_000));

  // Then loop forever
  while (true) {
    try {
      await runIngestionCycle(broadcast);
    } catch(e) {
      console.error('[Ingestion] Cycle error:', e.message);
    }
    await new Promise(r => setTimeout(r, CYCLE_MS));
  }
}
