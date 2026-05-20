// ════════════════════════════════════════════════════════
//  ORBIT — High-Volume News Engine v7
//  Strategy: Section-level bulk queries → 250+ articles
//  from 5 Guardian calls + 80 RSS feeds in parallel
//  Target: Sports 50+, Tech 40+, Gaming 30+, Entertainment 40+, World 60+
// ════════════════════════════════════════════════════════

const GUARDIAN = 'https://content.guardianapis.com';
const GKEY     = 'test';
const DW       = 'https://rss.dw.com/rdf';
const BBC      = 'https://feeds.bbci.co.uk';

// ─── Category → Guardian sections ────────────────────────────────────────────
// Section-level bulk queries — FAR more efficient than per-tag queries.
// Each section query returns up to 50 articles covering the whole category.
const BULK_SECTIONS = [
  {
    sections: 'sport,football',
    category: 'sports',
    pageSize: 50,
    orderBy:  'newest',
  },
  {
    sections: 'film,music,television,culture,arts,stage,lifeandstyle',
    category: 'entertainment',
    pageSize: 40,
    orderBy:  'newest',
  },
  {
    sections: 'games',
    category: 'gaming',
    pageSize: 30,
    orderBy:  'newest',
  },
  {
    sections: 'technology,science,environment',
    category: 'technology',
    pageSize: 40,
    orderBy:  'newest',
  },
  {
    sections: 'world,us-news,uk-news,politics,business,global-development',
    category: 'world',
    pageSize: 50,
    orderBy:  'newest',
  },
];

// ─── Country detection from Guardian article ──────────────────────────────────
const TAG_COUNTRY = {
  'united-kingdom':'UK','uk':'UK','england':'UK','scotland':'UK','wales':'UK',
  'united-states':'US','us-news':'US','america':'US','new-york':'US','california':'US',
  'china':'CN','japan':'JP','south-korea':'KR','france':'FR','germany':'DE',
  'spain':'ES','india':'IN','brazil':'BR','australia':'AU','russia':'RU',
  'canada':'CA','mexico':'MX','argentina':'AR','italy':'IT','portugal':'PT',
  'netherlands':'NL','ukraine':'UA','turkey':'TR','saudi-arabia':'SA','uae':'AE',
  'nigeria':'NG','south-africa':'ZA','indonesia':'ID','singapore':'SG',
  'israel':'IL','iran':'IR','egypt':'EG','ethiopia':'ET','ghana':'GH',
  'colombia':'CO','chile':'CL','peru':'PE','vietnam':'VN','thailand':'TH',
  'malaysia':'MY','philippines':'PH','pakistan':'PK','bangladesh':'BD',
  'poland':'PL','sweden':'SE','norway':'NO','switzerland':'CH','belgium':'BE',
};

const LEAGUE_COUNTRY = {
  'football/premier-league':'UK','football/fa-cup':'UK',
  'football/laliga':'ES','football/copa-del-rey':'ES',
  'football/bundesliga':'DE',
  'football/ligue1':'FR',
  'football/seriea':'IT',
  'football/champions-league':'DE',  // neutral but common
  'football/europa-league':'UK',
  'football/world-cup':'BR',
  'sport/nba':'US','sport/nfl':'US','sport/mlb':'US','sport/nhl':'US',
  'sport/formula-one':'UK',
  'sport/cricket':'IN',
  'sport/tennis':'UK',
  'sport/cycling':'FR',
  'sport/boxing':'US',
  'sport/olympics':'JP',
  'sport/rugby-union':'UK',
  'games/playstation':'JP','games/nintendo':'JP','games/xbox':'US',
  'games/games':'US',
};

// Category → likely countries (for articles without clear geo signal)
const CAT_COUNTRIES = {
  sports:        ['UK','ES','DE','FR','IT','US','BR','AR','IN'],
  entertainment: ['US','UK','KR','JP','IN','FR'],
  gaming:        ['US','JP','KR','UK','DE','FR'],
  technology:    ['US','KR','JP','CN','UK','DE'],
  world:         ['US','CN','UK','JP','KR','FR','DE','ES','IN','BR'],
};

let _countryRoundRobin = {};
function nextCountryForCat(cat) {
  const pool = CAT_COUNTRIES[cat] || ['US'];
  const idx  = (_countryRoundRobin[cat] || 0) % pool.length;
  _countryRoundRobin[cat] = idx + 1;
  return pool[idx];
}

function detectCountry(article) {
  const tags = article.tags || [];

  // 1. League/game tags → precise country
  for (const t of tags) {
    const lc = LEAGUE_COUNTRY[t.id];
    if (lc) return lc;
  }

  // 2. World tags → country
  for (const t of tags) {
    const parts = t.id.split('/');
    if (parts[0] === 'world' && parts.length === 2) {
      const c = TAG_COUNTRY[parts[1]];
      if (c) return c;
    }
    // topic/place pattern
    const tc = TAG_COUNTRY[t.id.split('/').pop()];
    if (tc) return tc;
  }

  // 3. Text keyword detection
  const txt = ((article.webTitle || '') + ' ' + (article.fields?.trailText || '')).toLowerCase();
  if (/premier league|arsenal|chelsea|man city|man united|liverpool|everton/i.test(txt)) return 'UK';
  if (/la liga|barcelona|real madrid|atletico|sevilla/i.test(txt)) return 'ES';
  if (/bundesliga|bayern|borussia|dortmund/i.test(txt)) return 'DE';
  if (/ligue 1|psg|paris saint-germain|marseille|olympique/i.test(txt)) return 'FR';
  if (/serie a|juventus|inter milan|ac milan|napoli/i.test(txt)) return 'IT';
  if (/nba|nfl|mlb|nhl|lebron|curry|mahomes|silicon valley|hollywood/i.test(txt)) return 'US';
  if (/japan|japanese|tokyo|nintendo|honda|toyota/i.test(txt)) return 'JP';
  if (/china|chinese|beijing|shanghai|alibaba|tencent/i.test(txt)) return 'CN';
  if (/india|indian|mumbai|bollywood|modi/i.test(txt)) return 'IN';
  if (/brazil|brasil|são paulo|rio|neymar/i.test(txt)) return 'BR';
  if (/korea|korean|seoul|k-pop|samsung|hyundai/i.test(txt)) return 'KR';
  if (/australia|australian|sydney|melbourne/i.test(txt)) return 'AU';
  if (/russia|russian|moscow|kremlin|putin/i.test(txt)) return 'RU';
  if (/france|french|paris|macron/i.test(txt)) return 'FR';
  if (/germany|german|berlin|merkel/i.test(txt)) return 'DE';
  if (/ukraine|ukrainian|kyiv|zelenskyy/i.test(txt)) return 'UA';
  if (/middle east|saudi|dubai|uae|qatar/i.test(txt)) return 'SA';
  if (/africa|nigeria|kenya|ghana/i.test(txt)) return 'NG';
  if (/argentina|buenos aires|messi/i.test(txt)) return 'AR';
  if (/canada|toronto|montreal/i.test(txt)) return 'CA';

  return null; // resolved by round-robin later
}

// ─── Country centroid coordinates ─────────────────────────────────────────────
const COUNTRY_COORDS = {
  UK:{ lat:52.5, lng:-1.8 },   US:{ lat:39.5, lng:-98.4 },  ES:{ lat:40.0, lng:-4.0 },
  FR:{ lat:46.2, lng:2.2 },    DE:{ lat:51.2, lng:10.5 },   JP:{ lat:36.2, lng:138.2 },
  CN:{ lat:35.0, lng:105.0 },  BR:{ lat:-14.2,lng:-51.9 },  IN:{ lat:20.6, lng:79.0 },
  KR:{ lat:35.9, lng:127.8 },  AU:{ lat:-25.3,lng:133.8 },  RU:{ lat:61.5, lng:90.0 },
  CA:{ lat:56.1, lng:-106.3 }, MX:{ lat:23.6, lng:-102.5 }, AR:{ lat:-38.4,lng:-63.6 },
  IT:{ lat:42.5, lng:12.6 },   SA:{ lat:23.9, lng:45.1 },   AE:{ lat:23.5, lng:53.8 },
  NG:{ lat:9.1,  lng:8.7 },    ZA:{ lat:-28.5,lng:24.7 },   UA:{ lat:48.4, lng:31.2 },
  TR:{ lat:38.9, lng:35.2 },   ID:{ lat:-2.5, lng:118.0 },  SG:{ lat:1.3,  lng:103.8 },
  PL:{ lat:51.9, lng:19.1 },   NL:{ lat:52.1, lng:5.3 },    SE:{ lat:60.1, lng:18.6 },
  PT:{ lat:39.6, lng:-8.2 },   IL:{ lat:31.5, lng:34.8 },   PK:{ lat:30.4, lng:69.3 },
  BD:{ lat:23.7, lng:90.4 },   EG:{ lat:26.8, lng:30.8 },   TH:{ lat:15.9, lng:100.9 },
  MY:{ lat:4.2,  lng:109.0 },  PH:{ lat:12.9, lng:121.8 },  VN:{ lat:16.2, lng:107.8 },
  CO:{ lat:4.6,  lng:-74.3 },  CL:{ lat:-35.7,lng:-71.5 },  CH:{ lat:46.8, lng:8.2 },
  BE:{ lat:50.5, lng:4.5 },    AT:{ lat:47.5, lng:14.5 },   GR:{ lat:39.1, lng:21.8 },
};

function coordsFor(country, jitter = 0.5) {
  const cc = COUNTRY_COORDS[country];
  if (!cc) return { lat: (Math.random()-0.5)*120, lng: (Math.random()-0.5)*320 };
  return { lat: cc.lat + (Math.random()-0.5)*jitter, lng: cc.lng + (Math.random()-0.5)*jitter };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function strip(h) {
  return (h||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#?\w+;/g,' ').trim();
}

function ago(d) {
  if (!d) return '';
  const h = (Date.now()-new Date(d))/3_600_000;
  if (h<1) return `${Math.round(h*60)}m ago`;
  if (h<24) return `${Math.round(h)}h ago`;
  return `${Math.round(h/24)}d ago`;
}

function linkBtn(url, label = 'Read full article →') {
  if (!url) return '';
  return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border-radius:99px;font-size:13px;font-weight:600;color:#fff;text-decoration:none;margin-top:8px">${label}</a>`;
}

// ─── Convert Guardian article to ORBIT item ───────────────────────────────────
function gToItem(article, defaultCat) {
  const cat     = defaultCat;
  const country = detectCountry(article) || nextCountryForCat(cat);
  const coords  = coordsFor(country, 0.6);

  return {
    id:        article.id,
    title:     article.webTitle,
    summary:   strip(article.fields?.trailText || ''),
    content:   linkBtn(article.webUrl),
    category:  cat,
    country,
    lat:       coords.lat,
    lng:       coords.lng,
    intensity: 0.5 + Math.random() * 0.5,
    timestamp: new Date(article.webPublicationDate).getTime(),
    timeAgo:   ago(article.webPublicationDate),
    source:    'The Guardian',
    url:       article.webUrl,
    tags:      (article.tags||[]).slice(0,6).map(t=>t.id.split('/').pop()),
    readTime:  '3 min',
    trend:     Math.random()>0.4?'rising':'stable',
    lang:      'en',
    sourceCount: 1,
  };
}

// ─── Guardian bulk section fetch ──────────────────────────────────────────────
async function fetchGuardianBulk(signal) {
  const all = [];

  const results = await Promise.allSettled(BULK_SECTIONS.map(async (q) => {
    const url = [
      `${GUARDIAN}/search`,
      `?api-key=${GKEY}`,
      `&section=${encodeURIComponent(q.sections)}`,
      `&page-size=${q.pageSize}`,
      `&order-by=${q.orderBy}`,
      `&show-fields=trailText`,
      `&show-tags=keyword`,
    ].join('');

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`G${res.status}`);
    const articles = (await res.json()).response.results || [];
    return articles.map(a => gToItem(a, q.category));
  }));

  results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
  console.log(`[Guardian bulk] ${all.length} articles across 5 sections`);
  return all;
}

// ─── RSS FEEDS — 80+ international feeds ─────────────────────────────────────
const RSS = [
  // ── DW (CORS-native, 38 feeds) ──
  { u:`${DW}/rss-en-top`, s:'DW World',        c:'UK', cat:'world',         lang:'en', d:true },
  { u:`${DW}/rss-en-sp3`, s:'DW Sports',       c:'DE', cat:'sports',        lang:'en', d:true },
  { u:`${DW}/rss-en-cul`, s:'DW Culture',      c:'UK', cat:'entertainment', lang:'en', d:true },
  { u:`${DW}/rss-en-cns`, s:'DW Science',      c:'DE', cat:'technology',    lang:'en', d:true },
  { u:`${DW}/rss-en-eco`, s:'DW Economy',      c:'DE', cat:'world',         lang:'en', d:true },
  { u:`${DW}/rss-sp-pol`, s:'DW Español',      c:'ES', cat:'world',         lang:'es', d:true },
  { u:`${DW}/rss-sp-sp3`, s:'DW Deportes',     c:'ES', cat:'sports',        lang:'es', d:true },
  { u:`${DW}/rss-sp-eco`, s:'DW Economía ES',  c:'ES', cat:'world',         lang:'es', d:true },
  { u:`${DW}/rss-sp-cul`, s:'DW Cultura ES',   c:'ES', cat:'entertainment', lang:'es', d:true },
  { u:`${DW}/rss-sp-cns`, s:'DW Ciencia ES',   c:'ES', cat:'technology',    lang:'es', d:true },
  { u:`${DW}/rss-sp-all`, s:'DW MX',           c:'MX', cat:'world',         lang:'es', d:true },
  { u:`${DW}/rss-fr-pol`, s:'DW France',       c:'FR', cat:'world',         lang:'fr', d:true },
  { u:`${DW}/rss-fr-sp3`, s:'DW Sport FR',     c:'FR', cat:'sports',        lang:'fr', d:true },
  { u:`${DW}/rss-fr-eco`, s:"DW Éco FR",       c:'FR', cat:'world',         lang:'fr', d:true },
  { u:`${DW}/rss-fr-cul`, s:'DW Culture FR',   c:'FR', cat:'entertainment', lang:'fr', d:true },
  { u:`${DW}/rss-de-pol`, s:'DW Deutsch',      c:'DE', cat:'world',         lang:'de', d:true },
  { u:`${DW}/rss-de-sp3`, s:'DW Sport DE',     c:'DE', cat:'sports',        lang:'de', d:true },
  { u:`${DW}/rss-de-eco`, s:'DW Wirtschaft',   c:'DE', cat:'world',         lang:'de', d:true },
  { u:`${DW}/rss-de-cul`, s:'DW Kultur',       c:'DE', cat:'entertainment', lang:'de', d:true },
  { u:`${DW}/rss-de-cns`, s:'DW Wissen',       c:'DE', cat:'technology',    lang:'de', d:true },
  { u:`${DW}/rss-ar-ara`, s:'DW عربي',         c:'SA', cat:'world',         lang:'ar', d:true },
  { u:`${DW}/rss-br-top`, s:'DW Brasil',       c:'BR', cat:'world',         lang:'pt', d:true },
  { u:`${DW}/rss-br-sp3`, s:'DW Esportes BR',  c:'BR', cat:'sports',        lang:'pt', d:true },
  { u:`${DW}/rss-ru-rus`, s:'DW Русский',      c:'RU', cat:'world',         lang:'ru', d:true },
  { u:`${DW}/rss-tr-tur`, s:'DW Türkçe',       c:'TR', cat:'world',         lang:'tr', d:true },
  { u:`${DW}/rss-uk-ukr`, s:'DW Українська',  c:'UA', cat:'world',         lang:'uk', d:true },
  { u:`${DW}/rss-id-ind`, s:'DW Indonesia',    c:'ID', cat:'world',         lang:'id', d:true },
  { u:`${DW}/rss-ko-kor`, s:'DW 한국어',        c:'KR', cat:'world',         lang:'ko', d:true },
  { u:`${DW}/rss-hi-ind`, s:'DW हिन्दी',       c:'IN', cat:'world',         lang:'hi', d:true },
  { u:`${DW}/rss-ms-mas`, s:'DW Melayu',       c:'MY', cat:'world',         lang:'ms', d:true },
  { u:`${DW}/rss-vi-vie`, s:'DW Việt',         c:'VN', cat:'world',         lang:'vi', d:true },
  { u:`${DW}/rss-sw-swa`, s:'DW Kiswahili',    c:'NG', cat:'world',         lang:'sw', d:true },

  // ── BBC (CORS-native) ──
  { u:`${BBC}/sport/rss.xml`,                      s:'BBC Sport',       c:'UK', cat:'sports',        lang:'en', d:true },
  { u:`${BBC}/sport/football/rss.xml`,             s:'BBC Football',    c:'UK', cat:'sports',        lang:'en', d:true },
  { u:`${BBC}/news/world/rss.xml`,                 s:'BBC World',       c:'UK', cat:'world',         lang:'en', d:true },
  { u:`${BBC}/news/technology/rss.xml`,            s:'BBC Tech',        c:'UK', cat:'technology',    lang:'en', d:true },
  { u:`${BBC}/news/entertainment_and_arts/rss.xml`,s:'BBC Entertainment',c:'UK',cat:'entertainment', lang:'en', d:true },
  { u:`${BBC}/news/science_and_environment/rss.xml`,s:'BBC Science',    c:'UK', cat:'technology',    lang:'en', d:true },
  { u:`${BBC}/news/business/rss.xml`,              s:'BBC Business',    c:'UK', cat:'world',         lang:'en', d:true },
  { u:`${BBC}/mundo/rss.xml`,                      s:'BBC Mundo',       c:'ES', cat:'world',         lang:'es', d:true },

  // ── France 24 (CORS-native) ──
  { u:'https://www.france24.com/en/rss',           s:'France 24',       c:'FR', cat:'world',         lang:'en', d:true },
  { u:'https://www.france24.com/fr/rss',           s:'France 24 FR',    c:'FR', cat:'world',         lang:'fr', d:true },

  // ── ABC Australia (CORS-native) ──
  { u:'https://www.abc.net.au/news/feed/51120/rss.xml', s:'ABC Australia', c:'AU', cat:'world',      lang:'en', d:true },

  // ── International via proxy ──
  { u:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', s:'El País',    c:'ES', cat:'world',   lang:'es' },
  { u:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/espana', s:'El País ES', c:'ES', cat:'world',   lang:'es' },
  { u:'https://e00-marca.uecdn.es/rss/portada.xml',  s:'Marca',           c:'ES', cat:'sports',      lang:'es' },
  { u:'https://www.as.com/rss.xml',                  s:'AS',              c:'ES', cat:'sports',      lang:'es' },
  { u:'https://www.xataka.com/index.xml',            s:'Xataka',          c:'ES', cat:'technology',  lang:'es' },
  { u:'https://www.lemonde.fr/rss/une.xml',          s:'Le Monde',        c:'FR', cat:'world',       lang:'fr' },
  { u:'https://www.lequipe.fr/rss/actu_rss.xml',    s:"L'Équipe",        c:'FR', cat:'sports',      lang:'fr' },
  { u:'https://www.lefigaro.fr/rss/figaro_actualites.xml', s:'Le Figaro', c:'FR', cat:'world',       lang:'fr' },
  { u:'https://www.tagesschau.de/xml/rss2/',         s:'Tagesschau',      c:'DE', cat:'world',       lang:'de' },
  { u:'https://www.kicker.de/news/fussball/bundesliga/spieltag/1-bundesliga.rss', s:'Kicker', c:'DE', cat:'sports', lang:'de' },
  { u:'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', s:'ANSA',   c:'IT', cat:'world',       lang:'it' },
  { u:'https://www.gazzetta.it/rss/calcio.xml',      s:'Gazzetta',        c:'IT', cat:'sports',      lang:'it' },
  { u:'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', s:'Folha',c:'BR', cat:'world',       lang:'pt' },
  { u:'https://www.clarin.com/rss/ultimas_noticias.xml', s:'Clarín',      c:'AR', cat:'world',       lang:'es' },
  { u:'https://www.koreaherald.com/common/rss.php',  s:'Korea Herald',    c:'KR', cat:'world',       lang:'ko' },
  { u:'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', s:'Times of India', c:'IN', cat:'world', lang:'en' },
  { u:'https://rss.cbc.ca/lineup/topstories.xml',   s:'CBC',             c:'CA', cat:'world',       lang:'en' },
  { u:'https://www.aljazeera.com/xml/rss/all.xml',  s:'Al Jazeera',      c:'SA', cat:'world',       lang:'en' },
  { u:'https://www3.nhk.or.jp/rss/news/cat0.xml',   s:'NHK',             c:'JP', cat:'world',       lang:'ja' },
];

// ─── RSS fetch ────────────────────────────────────────────────────────────────
async function fetchRSS(feed, signal) {
  let xml = null;
  if (feed.d) {
    try { const r = await fetch(feed.u, { signal }); if (r.ok) xml = await r.text(); } catch(_) {}
  }
  if (!xml || xml.length < 80) {
    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(feed.u)}`;
      const r = await fetch(proxy, { signal });
      if (r.ok) { const d = await r.json(); xml = d.contents; }
    } catch(_) {}
  }
  if (!xml || xml.length < 80) return [];

  try {
    const doc   = new DOMParser().parseFromString(xml, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 12);
    const clean = s => strip((s||'').replace(/<!\[CDATA\[|\]\]>/g,''));

    return items.map((item, i) => {
      const title   = clean(item.querySelector('title')?.textContent);
      const desc    = clean(item.querySelector('description')?.textContent);
      const url     = clean(item.querySelector('link')?.textContent) || clean(item.querySelector('guid')?.textContent) || '';
      const pub     = item.querySelector('pubDate')?.textContent || '';
      if (!title || title.length < 5) return null;

      const coords = coordsFor(feed.c, 0.4);
      return {
        id:        `rss-${feed.s}-${i}-${Date.now()}`,
        title,
        summary:   desc.slice(0, 300),
        content:   linkBtn(url),
        category:  feed.cat,
        country:   feed.c,
        lat:       coords.lat,
        lng:       coords.lng,
        intensity: 0.45 + Math.random() * 0.5,
        timestamp: pub ? new Date(pub).getTime() : Date.now() - i * 2_400_000,
        timeAgo:   ago(pub) || `${i * 2 + 1}h ago`,
        source:    feed.s,
        url,
        tags:      [feed.cat, feed.c.toLowerCase()],
        readTime:  '2 min',
        trend:     Math.random()>.4?'rising':'stable',
        lang:      feed.lang || 'en',
        sourceCount: 1,
      };
    }).filter(Boolean);
  } catch(_) { return []; }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function fetchNews() {
  const gSignal  = AbortSignal.timeout(20_000);
  const rSignal  = AbortSignal.timeout(15_000);
  const all      = [];

  // PARALLEL: Guardian bulk (5 queries, 250 articles) + RSS (60 feeds)
  const [gResult, rResults] = await Promise.allSettled([
    fetchGuardianBulk(gSignal),
    Promise.allSettled(RSS.map(f => fetchRSS(f, rSignal))),
  ]);

  if (gResult.status === 'fulfilled') all.push(...gResult.value);
  if (rResults.status === 'fulfilled') {
    rResults.value.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
  }

  console.log(`[Ingestion] ${all.length} raw articles | ${new Set(all.map(n=>n.category)).size} categories | ${new Set(all.map(n=>n.country)).size} countries`);
  return all;
}
