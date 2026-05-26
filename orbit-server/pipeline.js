// ════════════════════════════════════════════════════════
//  ORBIT Server — AI Processing Pipeline
//  Transforms raw articles into intelligent ORBIT stories
// ════════════════════════════════════════════════════════

import fetch from 'node-fetch';
import { GROQ_KEY } from './sources.js';

// ─── Country detection ────────────────────────────────────────────────────────
const LEAGUE_COUNTRY = {
  'football/premier-league':'UK','football/fa-cup':'UK',
  'football/laliga':'ES','football/bundesliga':'DE','football/ligue1':'FR',
  'football/seriea':'IT','football/champions-league':'DE','football/europa-league':'UK',
  'sport/nba':'US','sport/nfl':'US','sport/mlb':'US','sport/nhl':'US',
  'sport/formula-one':'UK','sport/cricket':'IN','sport/tennis':'UK',
  'sport/cycling':'FR','sport/boxing':'US','sport/olympics':'JP',
  'sport/rugby-union':'UK','games/playstation':'JP','games/nintendo':'JP',
  'games/xbox':'US','games/games':'US',
};

const TAG_COUNTRY = {
  'united-kingdom':'UK','uk':'UK','england':'UK','scotland':'UK',
  'united-states':'US','america':'US','california':'US','new-york':'US',
  'china':'CN','japan':'JP','south-korea':'KR','france':'FR','germany':'DE',
  'spain':'ES','india':'IN','brazil':'BR','australia':'AU','russia':'RU',
  'canada':'CA','mexico':'MX','argentina':'AR','italy':'IT','ukraine':'UA',
  'turkey':'TR','saudi-arabia':'SA','nigeria':'NG','south-africa':'ZA',
  'indonesia':'ID','netherlands':'NL','portugal':'PT','poland':'PL',
  'singapore':'SG','egypt':'EG','iran':'IR','israel':'IL',
};

const CAT_COUNTRIES = {
  sports:        ['UK','ES','DE','FR','IT','US','BR','AR','IN','AU'],
  entertainment: ['US','UK','KR','JP','IN','FR','AU'],
  gaming:        ['US','JP','KR','UK','DE','FR'],
  technology:    ['US','KR','JP','CN','UK','DE','SE'],
  world:         ['US','CN','UK','JP','KR','FR','DE','ES','IN','BR','AU','RU','UA'],
  trending:      ['US','UK','KR','JP','BR','IN'],
};

let _rr = {};
function nextCountry(cat) {
  const pool = CAT_COUNTRIES[cat] || ['US'];
  const idx  = (_rr[cat] = ((_rr[cat] || 0) + 1) % pool.length);
  return pool[idx];
}

export function detectCountry(tags = [], title = '', summary = '') {
  for (const t of tags) {
    const lc = LEAGUE_COUNTRY[t]; if (lc) return lc;
    const parts = t.split('/');
    if (parts[0] === 'world' && parts.length === 2) {
      const c = TAG_COUNTRY[parts[1]]; if (c) return c;
    }
  }
  const txt = (title + ' ' + summary).toLowerCase();
  if (/premier league|arsenal|chelsea|man city|man united|liverpool/i.test(txt)) return 'UK';
  if (/la liga|barcelona|real madrid|atletico/i.test(txt)) return 'ES';
  if (/bundesliga|bayern|borussia|dortmund/i.test(txt)) return 'DE';
  if (/ligue 1|psg|paris saint-germain/i.test(txt)) return 'FR';
  if (/serie a|juventus|inter milan|ac milan|napoli/i.test(txt)) return 'IT';
  if (/nba|nfl|nhl|mlb|lebron|warriors|lakers|mahomes/i.test(txt)) return 'US';
  if (/silicon valley|openai|google|apple.*event|meta.*announce/i.test(txt)) return 'US';
  if (/japan|japanese|tokyo|anime|nintendo|sony/i.test(txt)) return 'JP';
  if (/china|chinese|beijing|shanghai|alibaba|tencent/i.test(txt)) return 'CN';
  if (/india|indian|mumbai|bollywood|modi|bcci/i.test(txt)) return 'IN';
  if (/brazil|brasil|são paulo|rio|neymar|flamengo/i.test(txt)) return 'BR';
  if (/korea|korean|seoul|k-pop|k-drama|samsung|bts/i.test(txt)) return 'KR';
  if (/australia|sydney|melbourne|afl/i.test(txt)) return 'AU';
  if (/ukraine|ukrainian|kyiv|zelenskyy/i.test(txt)) return 'UA';
  if (/russia|russian|moscow|putin|kremlin/i.test(txt)) return 'RU';
  if (/france|french|paris|macron|élysée/i.test(txt)) return 'FR';
  if (/germany|german|berlin|bundesrat|scholz/i.test(txt)) return 'DE';
  if (/spain|spanish|madrid|barcelona|pedro sanchez/i.test(txt)) return 'ES';
  if (/italy|italian|rome|milan|rome/i.test(txt)) return 'IT';
  if (/portugal|portuguese|lisbon/i.test(txt)) return 'PT';
  if (/netherlands|dutch|amsterdam|hague/i.test(txt)) return 'NL';
  if (/poland|polish|warsaw|krakow/i.test(txt)) return 'PL';
  if (/turkey|turkish|ankara|erdogan/i.test(txt)) return 'TR';
  if (/israel|tel aviv|netanyahu|gaza|hamas/i.test(txt)) return 'IL';
  if (/saudi|riyadh|aramco|mbs/i.test(txt)) return 'SA';
  if (/dubai|abu dhabi|emirates|uae/i.test(txt)) return 'AE';
  if (/egypt|cairo|sisi/i.test(txt)) return 'EG';
  if (/nigeria|lagos|abuja/i.test(txt)) return 'NG';
  if (/south africa|cape town|johannesburg/i.test(txt)) return 'ZA';
  if (/indonesia|jakarta/i.test(txt)) return 'ID';
  if (/singapore|strait/i.test(txt)) return 'SG';
  if (/thailand|bangkok|thai/i.test(txt)) return 'TH';
  if (/canada|toronto|montreal|ottawa|trudeau/i.test(txt)) return 'CA';
  if (/argentina|buenos aires|messi|milei/i.test(txt)) return 'AR';
  if (/mexico|ciudad de mexico|pemex|amlo/i.test(txt)) return 'MX';
  if (/colombia|bogota|petro/i.test(txt)) return 'CO';
  if (/chile|santiago|boric/i.test(txt)) return 'CL';
  return null;
}

// ─── Country centroids ────────────────────────────────────────────────────────
const COORDS = {
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
  MY:{lat:4.2,lng:109.0},VN:{lat:16.2,lng:107.8},TH:{lat:15.9,lng:100.9},
  EG:{lat:26.8,lng:30.8},ET:{lat:8.6,lng:39.6},GH:{lat:7.9,lng:-1.0},
  CO:{lat:4.6,lng:-74.3},CL:{lat:-35.7,lng:-71.5},PE:{lat:-9.2,lng:-75.0},
};

export function coordsFor(country) {
  const c = COORDS[country];
  if (!c) return { lat: (Math.random()-0.5)*120, lng: (Math.random()-0.5)*320 };
  return { lat: c.lat + (Math.random()-0.5)*0.6, lng: c.lng + (Math.random()-0.5)*0.6 };
}

// ─── Semantic deduplication — delegates to semanticDedup.js ──────────────────
import { deduplicateArticles } from './semanticDedup.js';

export function clusterArticles(articles) {
  // Full TF-IDF + cosine similarity + entity overlap + canonical selection
  return deduplicateArticles(articles, {
    cosineThreshold:   0.68,
    entityThreshold:   0.45,
    combinedThreshold: 0.62,
  });
}

// ─── Trend scoring — semantic dedup already computes trendScore ──────────────
export function scoreArticles(articles) {
  // If trendScore already set by semanticDedup, just sort. Otherwise compute.
  const now = Date.now();
  return articles.map(n => {
    if (n.trendScore !== undefined) return n;
    const age      = Math.max(0, 1 - (now - (n.timestamp||0)) / (36*3_600_000));
    const sources  = Math.min((n.sourceCount||1) / 6, 1.0);
    return { ...n, trendScore: age*0.4 + sources*0.4 + (n.intensity||0.5)*0.2 };
  }).sort((a, b) => b.trendScore - a.trendScore);
}

// ─── GROQ AI summarization (optional, requires API key) ──────────────────────
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const _groqCache = new Map();

export async function generateAISummary(titles, category, country) {
  if (!GROQ_KEY) return null;
  const cacheKey = titles[0]?.slice(0,40);
  if (_groqCache.has(cacheKey)) return _groqCache.get(cacheKey);

  try {
    const prompt = `You are ORBIT, a global news intelligence engine. In exactly 1 sentence (max 120 chars), summarize this breaking news cluster from ${country} [${category}]: ${titles.slice(0,3).join(' | ')}`;
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role:'user', content: prompt }],
        max_tokens: 80,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || null;
    if (summary) { _groqCache.set(cacheKey, summary); }
    return summary;
  } catch(_) { return null; }
}

// ─── Density enforcement ──────────────────────────────────────────────────────
// Countries that get guaranteed articles if real news is scarce
const PRIORITY = [
  'US','UK','CN','JP','KR','FR','DE','ES','IN','BR',
  'AU','CA','MX','RU','IT','PT','NL','PL','TR','AR',
  'ZA','NG','SA','AE','UA','SG','ID',
];
const ALL_CATS  = ['sports','entertainment','gaming','technology','world'];
const MICRO_TEMPLATES = {
  sports: [
    c=>`${c} sports: major league activity picks up as teams battle for top positions`,
    c=>`Transfer market heats up in ${c} as clubs signal major signing intentions`,
    c=>`${c} football: this weekend's fixtures set for record viewing numbers`,
  ],
  entertainment: [
    c=>`Streaming platforms report record numbers from ${c}-produced content`,
    c=>`${c} entertainment industry attracts global investment and international attention`,
    c=>`New releases from ${c} top global charts across all major platforms`,
  ],
  gaming: [
    c=>`Gaming community in ${c} reacts to major platform announcements`,
    c=>`Esports scene explodes in ${c} with new tournament series announced`,
    c=>`${c} becomes key market as major publishers announce regional initiatives`,
  ],
  technology: [
    c=>`Tech sector in ${c} posts record growth as AI investment accelerates`,
    c=>`${c} emerges as hub for next-generation artificial intelligence research`,
    c=>`Startup ecosystem thrives in ${c} attracting unprecedented global funding`,
  ],
  world: [
    c=>`${c} diplomatic activity intensifies as global leaders engage on key issues`,
    c=>`Economic indicators in ${c} signal positive momentum amid global uncertainty`,
    c=>`${c} infrastructure investment reaches new heights amid sustained growth`,
  ],
};

let _microId = 0;
export function ensureDensity(articles) {
  const counts = {};
  articles.forEach(n => {
    const k = `${n.country}|${n.category}`;
    counts[k] = (counts[k]||0) + 1;
  });
  const fills = [];
  PRIORITY.forEach(country => {
    ALL_CATS.forEach(cat => {
      if ((counts[`${country}|${cat}`]||0) < 2) {  // 2 minimum (just for hotspot existence)
        const templates = MICRO_TEMPLATES[cat] || MICRO_TEMPLATES.world;
        const tmpl = templates[_microId++ % templates.length];
        const coords = coordsFor(country);
        fills.push({
          id:        `micro-${country}-${cat}-${Date.now()}-${Math.random()}`,
          title:     tmpl(country),
          summary:   `ORBIT Intelligence tracking this developing situation in ${country}.`,
          content:   '',
          category:  cat,
          country,
          lat:       coords.lat,
          lng:       coords.lng,
          intensity: 0.35 + Math.random()*0.2,
          timestamp: Date.now() - Math.floor(Math.random()*14)*3_600_000,
          timeAgo:   `${Math.floor(Math.random()*14)+1}h ago`,
          source:    'ORBIT Intelligence',
          url:       null,
          tags:      [cat, country.toLowerCase(),'orbit-ai'],
          readTime:  '1 min',
          trend:     'stable',
          lang:      'en',
          isMicro:   true,
          trendScore: 0.25,
          sourceCount: 1,
        });
      }
    });
  });
  return [...articles, ...fills];
}
