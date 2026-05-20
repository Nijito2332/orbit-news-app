// ════════════════════════════════════════════════════════
//  ORBIT — AI Processing Pipeline
//  Transforms raw fetched articles into premium ORBIT feed:
//  1. Deduplication (title similarity clustering)
//  2. Trend scoring (velocity × source diversity × recency)
//  3. Regional density enforcement (planet never empty)
//  4. Micro-story generation (AI-native fill cards)
//  5. Hotspot coordinate generation
// ════════════════════════════════════════════════════════

// ─── COUNTRY META ─────────────────────────────────────────────────────────────
const COUNTRY_NAMES = {
  UK:'United Kingdom', US:'United States', ES:'Spain', FR:'France', DE:'Germany',
  JP:'Japan', CN:'China', BR:'Brazil', IN:'India', KR:'South Korea',
  AU:'Australia', RU:'Russia', CA:'Canada', MX:'Mexico', AR:'Argentina',
  IT:'Italy', SA:'Saudi Arabia', AE:'UAE', NG:'Nigeria', ZA:'South Africa',
  UA:'Ukraine', TR:'Turkey', ID:'Indonesia', SG:'Singapore', PL:'Poland',
  NL:'Netherlands', SE:'Sweden', CH:'Switzerland', BE:'Belgium', NO:'Norway',
  PK:'Pakistan', BD:'Bangladesh', EG:'Egypt', MA:'Morocco', ET:'Ethiopia',
  TZ:'Tanzania', VN:'Vietnam', TH:'Thailand', MY:'Malaysia', PH:'Philippines',
};

// ─── Category × Country coordinates (for hotspot placement) ──────────────────
const CAT_COORDS = {
  UK:{ sports:[53.483,-2.200],entertainment:[51.510,-0.134],gaming:[51.507,-0.127],technology:[51.522,-0.088],world:[51.501,-0.124],trending:[51.505,-0.110] },
  US:{ sports:[40.750,-73.993],entertainment:[34.093,-118.328],gaming:[47.640,-122.320],technology:[37.387,-122.082],world:[38.907,-77.036],trending:[40.730,-73.935] },
  ES:{ sports:[40.453,-3.688],entertainment:[40.421,-3.692],gaming:[41.387,2.173],technology:[41.386,2.175],world:[40.416,-3.703],trending:[40.420,-3.700] },
  FR:{ sports:[48.924,2.360],entertainment:[48.872,2.330],gaming:[48.898,2.376],technology:[48.898,2.376],world:[48.864,2.333],trending:[48.877,2.356] },
  DE:{ sports:[48.218,11.625],entertainment:[53.553,9.993],gaming:[48.135,11.582],technology:[52.531,13.385],world:[52.520,13.376],trending:[52.520,13.380] },
  JP:{ sports:[35.665,139.714],entertainment:[35.695,139.702],gaming:[35.702,139.751],technology:[35.702,139.751],world:[35.676,139.745],trending:[35.661,139.699] },
  CN:{ sports:[40.009,116.391],entertainment:[31.230,121.474],gaming:[31.231,121.475],technology:[22.540,114.058],world:[39.905,116.391],trending:[31.233,121.473] },
  BR:{ sports:[-22.912,-43.172],entertainment:[-22.900,-43.200],gaming:[-23.565,-46.652],technology:[-23.567,-46.654],world:[-15.799,-47.864],trending:[-22.970,-43.185] },
  IN:{ sports:[22.519,88.343],entertainment:[19.089,72.868],gaming:[12.974,77.592],technology:[12.972,77.594],world:[28.614,77.202],trending:[19.076,72.877] },
  KR:{ sports:[37.569,126.980],entertainment:[37.487,127.028],gaming:[37.484,127.034],technology:[37.484,127.034],world:[37.576,126.976],trending:[37.559,126.992] },
  AU:{ sports:[-37.816,144.984],entertainment:[-33.857,151.215],gaming:[-33.870,151.200],technology:[-33.866,151.204],world:[-35.307,149.124],trending:[-33.857,151.210] },
  RU:{ sports:[55.831,37.440],entertainment:[55.760,37.618],gaming:[55.734,37.630],technology:[55.732,37.632],world:[55.751,37.618],trending:[55.756,37.617] },
  CA:{ sports:[43.641,-79.379],entertainment:[43.647,-79.381],gaming:[49.282,-123.120],technology:[43.653,-79.383],world:[45.422,-75.702],trending:[43.648,-79.386] },
  MX:{ sports:[19.482,-99.142],entertainment:[19.435,-99.143],gaming:[19.397,-99.173],technology:[19.395,-99.175],world:[19.432,-99.133],trending:[19.419,-99.155] },
  AR:{ sports:[-34.545,-58.450],entertainment:[-34.600,-58.379],gaming:[-34.599,-58.370],technology:[-34.598,-58.372],world:[-34.608,-58.371],trending:[-34.617,-58.376] },
  IT:{ sports:[45.478,9.124],entertainment:[41.902,12.482],gaming:[45.465,9.189],technology:[45.464,9.190],world:[41.897,12.481],trending:[45.472,9.186] },
  SA:{ sports:[24.689,46.682],entertainment:[24.700,46.690],gaming:[24.705,46.695],technology:[24.710,46.700],world:[24.680,46.675],trending:[24.695,46.688] },
  AE:{ sports:[25.185,55.270],entertainment:[25.205,55.270],gaming:[25.215,55.275],technology:[25.080,55.145],world:[24.450,54.375],trending:[25.200,55.272] },
  NG:{ sports:[6.455,3.395],entertainment:[6.460,3.400],gaming:[6.450,3.390],technology:[6.458,3.405],world:[9.082,8.675],trending:[6.465,3.410] },
  ZA:{ sports:[-26.200,28.049],entertainment:[-26.210,28.055],gaming:[-26.205,28.050],technology:[-33.921,18.424],world:[-25.746,28.188],trending:[-26.215,28.060] },
  UA:{ sports:[50.434,30.521],entertainment:[50.448,30.519],gaming:[50.444,30.524],technology:[50.445,30.523],world:[50.450,30.522],trending:[50.455,30.518] },
  TR:{ sports:[41.068,28.996],entertainment:[41.015,28.967],gaming:[41.025,28.975],technology:[41.020,28.970],world:[39.921,32.854],trending:[41.018,28.972] },
  ID:{ sports:[-6.218,106.802],entertainment:[-6.225,106.810],gaming:[-6.220,106.808],technology:[-6.215,106.798],world:[-6.200,106.780],trending:[-6.222,106.806] },
  SG:{ sports:[1.314,103.803],entertainment:[1.285,103.845],gaming:[1.304,103.832],technology:[1.359,103.820],world:[1.352,103.819],trending:[1.295,103.852] },
  PL:{ sports:[52.220,21.011],entertainment:[50.062,19.937],gaming:[52.229,21.012],technology:[52.231,21.013],world:[52.237,21.015],trending:[52.225,21.010] },
};

function getCoords(country, category) {
  const cc = CAT_COORDS[country];
  if (cc && cc[category]) {
    const [lat, lng] = cc[category];
    return { lat: lat + (Math.random() - 0.5) * 0.2, lng: lng + (Math.random() - 0.5) * 0.2 };
  }
  // Fallback: scatter around world
  const centers = { world:[20,0], sports:[51,-1], entertainment:[34,-118], gaming:[47,-122], technology:[37,-122], trending:[40,-74] };
  const [lat, lng] = centers[category] || [20, 0];
  return { lat: lat + (Math.random() - 0.5) * 80, lng: lng + (Math.random() - 0.5) * 100 };
}

// ─── 1. DEDUPLICATION ─────────────────────────────────────────────────────────
function titleTokens(title) {
  return new Set(title.toLowerCase().split(/\W+/).filter(w => w.length > 3));
}

function similarity(a, b) {
  const tA = titleTokens(a);
  const tB = titleTokens(b);
  if (!tA.size || !tB.size) return 0;
  let intersection = 0;
  tA.forEach(w => { if (tB.has(w)) intersection++; });
  return intersection / Math.min(tA.size, tB.size);
}

export function deduplicate(articles) {
  const clusters = [];

  for (const article of articles) {
    let placed = false;
    for (const cluster of clusters) {
      if (similarity(cluster.representative.title, article.title) > 0.45) {
        cluster.members.push(article);
        // Keep highest intensity as representative
        if ((article.intensity || 0) > (cluster.representative.intensity || 0)) {
          cluster.representative = article;
        }
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ representative: article, members: [article] });
  }

  // Boost score for stories covered by multiple sources
  return clusters.map(c => ({
    ...c.representative,
    intensity:    Math.min((c.representative.intensity || 0.5) + (c.members.length - 1) * 0.08, 1.0),
    sourceCount:  c.members.length,
    _clusterSize: c.members.length,
  }));
}

// ─── 2. TREND SCORING ────────────────────────────────────────────────────────
export function scoreTrending(articles) {
  const now = Date.now();
  return articles.map(n => {
    const ageFactor   = Math.max(0, 1 - (now - (n.timestamp || 0)) / (48 * 3_600_000));
    const sourceFactor = Math.min((n.sourceCount || 1) / 5, 1.0);
    const trendScore  = ageFactor * 0.4 + sourceFactor * 0.4 + (n.intensity || 0.5) * 0.2;
    return { ...n, trendScore };
  }).sort((a, b) => b.trendScore - a.trendScore);
}

// ─── 3. MICRO-STORY TEMPLATES ─────────────────────────────────────────────────
// Generated when a region × category is sparse (< 2 articles)
const MICRO_TEMPLATES = {
  sports: [
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} football league sees record viewership this weekend`, summary:`Football fever sweeps the nation as league matches deliver spectacular goals and controversial moments across all divisions.` }),
    (c) => ({ title:`Breaking: ${COUNTRY_NAMES[c]||c} national team reaches new global ranking milestone`, summary:`The national squad's impressive run of form has propelled them up the FIFA world rankings, boosting fan morale ahead of upcoming fixtures.` }),
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} sports fans react to major transfer window activity`, summary:`Social media explodes as clubs announce signings and departures in what analysts are calling one of the most active transfer periods in recent memory.` }),
  ],
  entertainment: [
    (c) => ({ title:`New streaming hits from ${COUNTRY_NAMES[c]||c} break global records on major platforms`, summary:`A wave of high-quality productions is putting ${COUNTRY_NAMES[c]||c} at the forefront of international entertainment, drawing audiences from over 50 countries.` }),
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} music scene dominates global charts for third consecutive week`, summary:`Artists from ${COUNTRY_NAMES[c]||c} continue to dominate streaming platforms, with multiple tracks charting simultaneously in over 30 markets worldwide.` }),
    (c) => ({ title:`Blockbuster film industry in ${COUNTRY_NAMES[c]||c} attracts record investment`, summary:`International studios are pouring resources into ${COUNTRY_NAMES[c]||c} productions as the creative scene gains global recognition and commercial success.` }),
  ],
  gaming: [
    (c) => ({ title:`Gaming culture in ${COUNTRY_NAMES[c]||c} reaches new heights with record esports viewership`, summary:`Competitive gaming events drew unprecedented crowds in ${COUNTRY_NAMES[c]||c} this week, with international teams competing for massive prize pools.` }),
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} becomes key market for major upcoming game launches`, summary:`Publishers are targeting ${COUNTRY_NAMES[c]||c} as a priority region for their biggest releases, recognizing the market's explosive growth in recent years.` }),
  ],
  technology: [
    (c) => ({ title:`Tech sector in ${COUNTRY_NAMES[c]||c} posts strongest quarterly growth in five years`, summary:`Investment in AI, cloud computing, and digital infrastructure is transforming ${COUNTRY_NAMES[c]||c}'s technology landscape and attracting global talent.` }),
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} becomes hub for artificial intelligence research and development`, summary:`A cluster of groundbreaking AI initiatives is emerging from ${COUNTRY_NAMES[c]||c}, positioning the country as a key player in the global technology race.` }),
  ],
  world: [
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} economic outlook upgraded by major international institutions`, summary:`Analysts revise growth forecasts upward for ${COUNTRY_NAMES[c]||c} as trade, investment, and consumer confidence indicators all point to sustained expansion.` }),
    (c) => ({ title:`Diplomatic activity intensifies as ${COUNTRY_NAMES[c]||c} hosts international summit`, summary:`World leaders converge on ${COUNTRY_NAMES[c]||c} for high-stakes talks on trade, security, and climate policy, with major agreements expected before the week's end.` }),
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} infrastructure investment reaches record levels amid economic boom`, summary:`The government announces a multi-billion investment package targeting transportation, energy, and digital infrastructure as growth continues to exceed expectations.` }),
  ],
  trending: [
    (c) => ({ title:`${COUNTRY_NAMES[c]||c} goes viral: social media trends capture global attention`, summary:`A wave of viral moments from ${COUNTRY_NAMES[c]||c} is sweeping across global platforms, sparking conversations about culture, politics, and creativity worldwide.` }),
  ],
};

let _microId = 0;
function generateMicroStory(country, category, timeOffset = 0) {
  const templates = MICRO_TEMPLATES[category] || MICRO_TEMPLATES.world;
  const template  = templates[_microId++ % templates.length](country);
  const coords    = getCoords(country, category);

  return {
    id:        `micro-${country}-${category}-${Date.now()}-${Math.random()}`,
    title:     template.title,
    summary:   template.summary,
    content:   '',
    category,
    country,
    lat:       coords.lat,
    lng:       coords.lng,
    intensity: 0.4 + Math.random() * 0.2,
    timestamp: Date.now() - timeOffset * 3_600_000,
    timeAgo:   timeOffset === 0 ? 'just now' : `${timeOffset}h ago`,
    source:    'ORBIT Intelligence',
    url:       null,
    tags:      [category, country.toLowerCase(), 'orbit-ai'],
    readTime:  '1 min',
    trend:     'rising',
    lang:      'en',
    isMicro:   true,
    trendScore: 0.3,
    sourceCount: 1,
  };
}

// ─── 4. DENSITY ENFORCEMENT ───────────────────────────────────────────────────
// Ensures top priority countries × categories are never empty
const PRIORITY_COUNTRIES = ['US','UK','CN','JP','KR','FR','DE','ES','IN','BR'];
const ALL_CATS = ['sports','entertainment','gaming','technology','world'];
const MIN_PER_GROUP = 2; // Minimum articles per country×category before micro-fill

export function enforceDensity(articles) {
  const result = [...articles];

  // Count articles per country×category
  const counts = {};
  articles.forEach(n => {
    const key = `${n.country}|${n.category}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  // Fill sparse groups with micro-stories
  PRIORITY_COUNTRIES.forEach(country => {
    ALL_CATS.forEach(cat => {
      const key = `${country}|${cat}`;
      const count = counts[key] || 0;
      if (count < MIN_PER_GROUP) {
        const needed = MIN_PER_GROUP - count;
        for (let i = 0; i < needed; i++) {
          result.push(generateMicroStory(country, cat, i * 4 + Math.floor(Math.random() * 12)));
        }
      }
    });
  });

  // Also add trending category micro-stories for key countries
  const trendCountries = ['US','UK','JP','KR','BR','IN'];
  trendCountries.forEach(c => {
    if (!(counts[`${c}|trending`] >= 2)) {
      result.push(generateMicroStory(c, 'trending', Math.floor(Math.random() * 6)));
    }
  });

  return result;
}

// ─── 5. ASSIGN HOTSPOT COORDINATES ────────────────────────────────────────────
export function assignCoordinates(articles) {
  return articles.map(n => {
    if (n._coordsAssigned) return n;
    const coords = getCoords(n.country, n.category);
    return { ...n, lat: coords.lat, lng: coords.lng, _coordsAssigned: true };
  });
}

// ─── MASTER PIPELINE ──────────────────────────────────────────────────────────
export function processFeed(rawArticles) {
  console.log(`[Pipeline] Input: ${rawArticles.length} raw articles`);

  // 1. Deduplicate
  const deduped = deduplicate(rawArticles);
  console.log(`[Pipeline] After dedup: ${deduped.length}`);

  // 2. Assign coordinates to articles that don't have proper ones
  const withCoords = assignCoordinates(deduped);

  // 3. Enforce density (fill sparse regions with micro-stories)
  const dense = enforceDensity(withCoords);
  console.log(`[Pipeline] After density enforcement: ${dense.length}`);

  // 4. Trend scoring
  const scored = scoreTrending(dense);

  // 5. Mark top trending articles
  const trending = scored.slice(0, 20);
  trending.forEach(n => { n.category = n.category === 'world' ? 'trending' : n.category; });

  console.log(`[Pipeline] Final: ${scored.length} articles | ${new Set(scored.map(n=>n.country)).size} countries`);
  return scored;
}
