/**
 * ORBIT — Global News Balancer
 *
 * Problem: UK gets 227 articles, Spain gets 16.
 * Fix: Cap over-represented countries, redistribute top articles to under-served ones.
 *
 * Algorithm:
 *  1. Cap any country at MAX_PER_COUNTRY (best articles kept)
 *  2. Build a global "overflow pool" from the excess
 *  3. For countries below MIN_PER_COUNTRY, inject top overflow articles
 *     with that country's code (they stay real news, just broader reach)
 */

const MAX_PER_COUNTRY = 40;   // hard cap — UK/US can't take >40 each
const MIN_PER_COUNTRY = 25;   // every priority country gets at least 25 UNIQUE real articles

// Countries that should always have content even if under-served by raw sources
const PRIORITY_COUNTRIES = [
  'US','UK','CN','JP','KR','FR','DE','ES','IN','BR',
  'AU','CA','MX','RU','IT','PT','NL','PL','TR','AR',
  'ZA','NG','SA','AE','UA','SG','ID','TH','IL','EG',
  'CO','CL','SE','NO','DK','FI','BE','AT','GR','CH',
  'PH','VN','MY','PK','BD','IR','IQ',
];

// Geographic regions for smart redistribution
const REGIONS = {
  EU:   ['UK','FR','DE','ES','IT','PT','NL','PL','SE','NO','DK','FI','BE','AT','GR','CH'],
  LATAM:['BR','MX','AR','CO','CL','PE','VE','UY','EC','BO'],
  ASIA: ['JP','CN','KR','IN','SG','ID','TH','VN','MY','PH','PK','BD'],
  MENA: ['SA','AE','IL','EG','TR','IQ','IR','LB'],
  AFR:  ['NG','ZA','KE','ET','GH','MA','TZ'],
  NA:   ['US','CA'],
  OCE:  ['AU','NZ'],
};

// Reverse map: country → region
const COUNTRY_REGION = {};
Object.entries(REGIONS).forEach(([region, countries]) => {
  countries.forEach(c => { COUNTRY_REGION[c] = region; });
});

export function globalBalance(articles) {
  // ── 1. Group by country ──────────────────────────────────────────────────
  const byCountry = new Map();
  for (const a of articles) {
    const c = a.country || 'UK';
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c).push(a);
  }

  // ── 2. Sort each country's articles by quality, cap at MAX ───────────────
  const result = [];
  const overflowPool = [];

  byCountry.forEach((arts, country) => {
    const sorted = [...arts].sort((a, b) =>
      (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0)
    );
    result.push(...sorted.slice(0, MAX_PER_COUNTRY));
    // Overflow: ONLY real articles (not micro-stories) — micro-stories are useless for redistribution
    // because the client filters them with !n.isMicro
    overflowPool.push(...sorted.slice(MAX_PER_COUNTRY).filter(a => !a.isMicro));
  });

  // ── 3. Sort overflow pool by quality ────────────────────────────────────
  overflowPool.sort((a, b) =>
    (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0)
  );

  // ── 4. Boost under-served priority countries ─────────────────────────────
  const usedIds = new Set(result.map(a => a.id));

  // Build per-country title fingerprint index to prevent same title appearing twice
  const countryTitleFPs = new Map(); // country → Set<titleFingerprint>
  for (const a of result) {
    const cc = a.country || '';
    if (!countryTitleFPs.has(cc)) countryTitleFPs.set(cc, new Set());
    const fp = (a.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 55);
    if (fp) countryTitleFPs.get(cc).add(fp);
  }

  for (const targetCountry of PRIORITY_COUNTRIES) {
    const existing = (byCountry.get(targetCountry) || []).filter(a => !a.isMicro).length;
    if (existing >= MIN_PER_COUNTRY) continue;

    const needed    = MIN_PER_COUNTRY - existing;
    const targetReg = COUNTRY_REGION[targetCountry];
    let   added     = 0;

    if (!countryTitleFPs.has(targetCountry)) countryTitleFPs.set(targetCountry, new Set());
    const targetFPs = countryTitleFPs.get(targetCountry);

    // Prefer overflow from the same region first, then global
    const candidates = [
      ...overflowPool.filter(a => COUNTRY_REGION[a.country] === targetReg),
      ...overflowPool.filter(a => COUNTRY_REGION[a.country] !== targetReg),
    ];

    for (const src of candidates) {
      if (added >= needed) break;
      if (usedIds.has(`${src.id}->${targetCountry}`)) continue;

      // Skip if this title already exists for this country (prevents same article 20x)
      const fp = (src.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 55);
      if (fp && targetFPs.has(fp)) continue;

      const redistributed = {
        ...src,
        id:               `${src.id}->${targetCountry}`,
        country:          targetCountry,
        _redistributed:   true,
        _originalCountry: src.country,
        intensity: Math.max((src.intensity || 0.5) * 0.82, 0.25),
      };

      result.push(redistributed);
      usedIds.add(redistributed.id);
      if (fp) targetFPs.add(fp);
      added++;
    }
  }

  return result;
}
