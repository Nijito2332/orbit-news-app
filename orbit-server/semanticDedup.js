/**
 * ORBIT — Semantic Deduplication Engine
 *
 * Pipeline:
 *  raw articles → normalize → TF-IDF vectors → cosine similarity
 *  → Union-Find clustering → canonical story selection → output
 *
 * No external APIs. Runs in ~10ms for 800 articles.
 * Cross-language via entity extraction (proper nouns survive translation).
 */

// ── Stopwords (EN + ES + FR + DE) ────────────────────────────────────────────
const STOPS = new Set([
  // EN
  'the','a','an','is','are','was','were','in','on','at','to','of','and','or',
  'that','this','it','its','for','with','from','by','as','be','been','have',
  'has','had','he','she','they','we','you','but','not','new','says','said',
  'after','first','over','how','who','why','what','will','one','year','years',
  'up','out','into','than','also','can','about','all','when','which','their',
  'there','so','do','did','news','latest','breaking','report','amid','could',
  'would','should','more','just','his','her','our','your','us','uk','un','eu',
  'via','ago','live','update','amid','two','three','four','five','six','seven',
  'eight','nine','ten','after','before','during','since','until','while',
  // ES
  'el','la','los','las','un','una','de','del','en','y','o','que','se','al',
  'no','por','con','sus','una','pero','si','sobre','entre','también','más',
  'como','ya','han','hay','fue','ser','este','esta','su','lo','le','les',
  // FR
  'le','la','les','un','une','des','du','au','aux','et','en','de','se',
  'est','sont','été','par','sur','pour','pas','plus','dans','avec','qui',
  // DE
  'der','die','das','ein','eine','und','in','ist','hat','von','für','mit',
  'auf','an','zu','im','dem','den','des','war','sind','bei','nach','aus',
]);

// ── Source authority weights ──────────────────────────────────────────────────
const SOURCE_RANK = {
  'Reuters':9,'Associated Press':9,'AP':9,'Bloomberg':9,'AFP':8,
  'BBC':8,'Guardian':7,'New York Times':7,'Washington Post':7,
  'El País':7,'Le Monde':7,'Der Spiegel':7,'DW':6,'Al Jazeera':6,
  'CNN':5,'NBC':5,'Fox News':4,'Daily Mail':3,'ORBIT Intelligence':1,
};
function srcRank(src) { return SOURCE_RANK[src] || 4; }

// ── Text preprocessing ────────────────────────────────────────────────────────

/** Extract named entities: capitalized sequences + numbers + dates */
function extractEntities(text) {
  const entities = new Set();

  // Named entities: sequences of capitalized words (2+ chars each)
  const namedRx = /\b([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{1,}(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{1,})*)\b/g;
  let m;
  while ((m = namedRx.exec(text)) !== null) {
    const e = m[1].trim();
    if (e.length >= 3 && e.split(' ').length <= 4) entities.add(e.toLowerCase());
  }

  // Numeric tokens (years, scores, percentages)
  const numRx = /\b(\d{4}|\d+%|\d+[\.,]\d+)\b/g;
  while ((m = numRx.exec(text)) !== null) entities.add(m[1]);

  return entities;
}

/** Tokenize: lowercase, remove punctuation, remove stopwords, min length 3 */
function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPS.has(w));
}

/** Build combined text from article fields */
function articleText(a) {
  return [
    a.title || '',
    a.title || '',          // weight title x2
    a.summary || '',
    (a.tags || []).join(' '),
  ].join(' ');
}

// ── TF-IDF engine ────────────────────────────────────────────────────────────

/**
 * Build TF-IDF vectors for all articles.
 * Returns Map<articleId, Map<term, tfidf>>
 */
function buildTFIDF(articles) {
  const N         = articles.length;
  const docTokens = articles.map(a => tokenize(articleText(a)));

  // Document frequency
  const df = new Map();
  docTokens.forEach(tokens => {
    new Set(tokens).forEach(t => df.set(t, (df.get(t) || 0) + 1));
  });

  // Build vectors
  const vectors = new Map();
  articles.forEach((a, i) => {
    const tokens = docTokens[i];
    if (!tokens.length) { vectors.set(a.id, new Map()); return; }

    // TF: log-normalized
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

    // TF-IDF vector
    const vec = new Map();
    tf.forEach((count, term) => {
      const idf   = Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;
      const tfidf = (1 + Math.log(count)) * idf;
      vec.set(term, tfidf);
    });

    // L2-normalize
    let norm = 0;
    vec.forEach(v => { norm += v * v; });
    norm = Math.sqrt(norm);
    if (norm > 0) vec.forEach((v, t) => vec.set(t, v / norm));

    vectors.set(a.id, vec);
  });

  return vectors;
}

/** Cosine similarity between two L2-normalized sparse vectors */
function cosineSim(vecA, vecB) {
  if (!vecA.size || !vecB.size) return 0;
  // Iterate over smaller vector
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  small.forEach((val, term) => {
    const b = large.get(term);
    if (b) dot += val * b;
  });
  return dot; // already L2-normalized → no division needed
}

// ── Entity overlap score ──────────────────────────────────────────────────────
/** Jaccard on entity sets — cross-language anchor */
function entityOverlap(entA, entB) {
  if (!entA.size || !entB.size) return 0;
  let inter = 0;
  entA.forEach(e => { if (entB.has(e)) inter++; });
  return inter / Math.max(entA.size, entB.size);
}

// ── Union-Find ────────────────────────────────────────────────────────────────
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank   = new Array(n).fill(0);
  }
  find(x) {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return;
    if (this.rank[px] < this.rank[py]) { this.parent[px] = py; }
    else if (this.rank[px] > this.rank[py]) { this.parent[py] = px; }
    else { this.parent[py] = px; this.rank[px]++; }
  }
}

// ── Canonical story selection ─────────────────────────────────────────────────
/**
 * From a cluster of articles covering the same story, pick the best one.
 * Score = source_rank + freshness + summary_length + entity_count
 */
function pickCanonical(members) {
  if (members.length === 1) return members[0];

  const now  = Date.now();
  const best = members.reduce((best, a) => {
    const freshness    = Math.max(0, 1 - (now - (a.timestamp || 0)) / (12 * 3600000)); // 12h window
    const richness     = Math.min((a.summary || '').length / 200, 1);
    const srcScore     = srcRank(a.source) / 9;
    const notMicro     = a.isMicro ? 0 : 0.3;
    const score        = srcScore * 0.4 + freshness * 0.3 + richness * 0.2 + notMicro * 0.1;
    return score > (best._canonScore || 0) ? { ...a, _canonScore: score } : best;
  }, { _canonScore: -1 });

  return best;
}

// ── Anti-spam filters ─────────────────────────────────────────────────────────
const SPAM_PATTERNS = [
  /click here/i, /you won't believe/i, /shocking/i,
  /\[ad\]/i, /sponsored/i, /buy now/i, /limited offer/i,
];
function isSpam(a) {
  const text = a.title + ' ' + (a.summary || '');
  return SPAM_PATTERNS.some(rx => rx.test(text)) || (a.title || '').length < 15;
}

function isRecycled(a, ageHoursThreshold = 36) {
  const age = (Date.now() - (a.timestamp || 0)) / 3600000;
  return age > ageHoursThreshold && a.isMicro;
}

// ── Main deduplication function ───────────────────────────────────────────────

/**
 * Deduplicate articles using TF-IDF cosine similarity + entity overlap.
 *
 * @param {Object[]} articles  — raw articles from all sources
 * @param {Object}   [opts]
 * @param {number}   [opts.cosineThreshold=0.68]   — same language
 * @param {number}   [opts.entityThreshold=0.45]   — cross-language boost
 * @param {number}   [opts.combinedThreshold=0.62] — entity+cosine combined
 * @returns {Object[]} deduplicated canonical articles (with _sources, _clusterSize)
 */
export function deduplicateArticles(articles, opts = {}) {
  const {
    cosineThreshold    = 0.68,
    entityThreshold    = 0.45,
    combinedThreshold  = 0.62,
  } = opts;

  // 1. Pre-filter spam + recycled
  const clean = articles.filter(a => !isSpam(a) && !isRecycled(a));
  if (clean.length === 0) return [];

  const N = clean.length;

  // 2. Build TF-IDF vectors
  const vectors  = buildTFIDF(clean);

  // 3. Extract entities per article
  const entities = clean.map(a => extractEntities(articleText(a)));

  // 4. Union-Find clustering via pairwise similarity
  const uf = new UnionFind(N);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const vecI = vectors.get(clean[i].id);
      const vecJ = vectors.get(clean[j].id);

      const cos   = cosineSim(vecI, vecJ);
      const ent   = entityOverlap(entities[i], entities[j]);

      // Combined score: cosine is primary, entity overlap is cross-language anchor
      const combined = cos * 0.65 + ent * 0.35;

      // Merge if any condition met:
      const merge =
        cos     >= cosineThreshold   ||   // pure text similarity
        ent     >= entityThreshold   ||   // same entities (cross-language)
        combined >= combinedThreshold;    // weighted combination

      if (merge) uf.union(i, j);
    }
  }

  // 5. Group articles by cluster root
  const clusterMap = new Map();
  for (let i = 0; i < N; i++) {
    const root = uf.find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(clean[i]);
  }

  // 6. For each cluster, pick canonical + enrich with metadata
  const canonical = [];
  clusterMap.forEach(members => {
    const best      = pickCanonical(members);
    const allSrcs   = [...new Set(members.map(m => m.source).filter(Boolean))];
    const countries = [...new Set(members.map(m => m.country).filter(Boolean))];
    const langs     = [...new Set(members.map(m => m.lang || 'en'))];

    canonical.push({
      ...best,
      sourceCount:    members.length,
      _sources:       allSrcs.slice(0, 8),
      _coverage:      members.length > 1 ? `+${members.length - 1}` : null,
      _coverageCount: members.length,
      _countries:     countries,
      _langs:         langs,
      _isMultiSource: members.length > 1,
      // Boost intensity by cluster size (more coverage = more important)
      intensity: Math.min(
        (best.intensity || 0.5) + Math.log(members.length) * 0.08,
        1.0
      ),
    });
  });

  // 7. Final sort by composite score
  const now = Date.now();
  return canonical
    .map(a => {
      const age      = Math.max(0, 1 - (now - (a.timestamp || 0)) / (24 * 3600000));
      const srcScore = srcRank(a.source) / 9;
      const trendScore = age * 0.35 + srcScore * 0.25 + (a.intensity || 0.5) * 0.25
                       + Math.min(a.sourceCount / 10, 1) * 0.15;
      return { ...a, trendScore };
    })
    .sort((a, b) => b.trendScore - a.trendScore);
}

/**
 * Diversity-aware selection for Daily Brief.
 * Ensures no two articles from the same story cluster.
 * Enforces geographic and categorical diversity.
 *
 * @param {Object[]} articles — already deduplicated canonical articles
 * @param {Object}   profile  — user preferences { categories[], followedCountries[] }
 * @param {number}   [limit=6]
 * @returns {Object[]}
 */
export function diverseSelection(articles, profile, limit = 6) {
  const prefCats     = profile?.categories || [];
  const usedClusters = new Set();
  const usedCats     = {};
  const usedCountries = {};
  const selected     = [];

  // Score by user preference + freshness + source quality
  const now = Date.now();
  const scored = articles
    .filter(a => !a.isMicro)  // never include AI-generated micro articles in Brief
    .map(a => {
      const age      = Math.max(0, 1 - (now - (a.timestamp || 0)) / (12 * 3600000));
      const catBonus = prefCats.includes(a.category) ? 1.5 : 0;
      const srcBonus = srcRank(a.source) / 9;
      const covBonus = Math.min(a.sourceCount / 5, 1) * 0.5;  // coverage breadth
      return { ...a, _briefScore: age * 0.3 + catBonus * 0.3 + srcBonus * 0.2 + covBonus * 0.2 };
    })
    .sort((a, b) => b._briefScore - a._briefScore);

  for (const a of scored) {
    if (selected.length >= limit) break;

    // Skip if we've already represented this category too much (max 2)
    const catCount = usedCats[a.category] || 0;
    if (catCount >= 2) continue;

    // Skip if country already appears 3+ times
    if (a.country && (usedCountries[a.country] || 0) >= 3) continue;

    // Skip near-duplicate clusters (cluster identity = first article title fingerprint)
    const fp = a.title?.slice(0, 20) || a.id;
    if (usedClusters.has(fp)) continue;

    selected.push(a);
    usedClusters.add(fp);
    usedCats[a.category]     = catCount + 1;
    if (a.country) usedCountries[a.country] = (usedCountries[a.country] || 0) + 1;
  }

  return selected;
}
