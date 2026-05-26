// ════════════════════════════════════════════════════════
//  ORBIT Server — In-Memory Story Store v2
//  Triple dedup: by ID + by URL + by normalized title
//  TTL: 6 hours
// ════════════════════════════════════════════════════════

const MAX_STORIES = 1000;  // Fly.io 1GB — comfortably fits 1000 stories in heap
const TTL_MS      = 6 * 3_600_000;

// ── Normalize helpers ────────────────────────────────────────────────────────

/** Stable fingerprint from URL (strip tracking params) */
function urlKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Strip query params — BBC adds ?at_campaign= etc.
    return u.origin + u.pathname;
  } catch(_) {
    return url.split('?')[0].split('#')[0].trim().toLowerCase().slice(0, 120);
  }
}

/** Normalized title: lowercase, no accents, no punctuation, first 60 chars */
function titleKey(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ── Store ────────────────────────────────────────────────────────────────────
class StoryStore {
  constructor() {
    this._stories    = new Map();   // id → story
    this._urlIndex   = new Map();   // urlKey → id
    this._titleIndex = new Map();   // titleKey → id
    this._lastUpdate = 0;
    this._stats = { totalIngested: 0, totalMerged: 0, updateCount: 0 };
  }

  _rebuild() {
    this._urlIndex.clear();
    this._titleIndex.clear();
    for (const [id, s] of this._stories) {
      const uk = urlKey(s.url);
      const tk = titleKey(s.title);
      if (uk) this._urlIndex.set(uk, id);
      if (tk) this._titleIndex.set(tk, id);
    }
  }

  merge(newStories) {
    const now   = Date.now();
    const added = [];

    // 1. Evict expired
    let evicted = 0;
    for (const [id, s] of this._stories) {
      if (now - (s.timestamp || 0) > TTL_MS) {
        this._stories.delete(id);
        evicted++;
      }
    }
    if (evicted) this._rebuild();

    for (const story of newStories) {
      if (!story?.title) continue;

      const uk = urlKey(story.url);
      const tk = titleKey(story.title);

      // ── Check URL identity (most reliable) ──────────────────────────────
      if (uk) {
        const existingId = this._urlIndex.get(uk);
        if (existingId) {
          // Same URL already in store — update metadata if richer
          const existing = this._stories.get(existingId);
          if (existing && (story.sourceCount || 1) > (existing.sourceCount || 1)) {
            this._stories.set(existingId, {
              ...existing,
              sourceCount: story.sourceCount,
              _sources:    story._sources || existing._sources,
              intensity:   Math.max(existing.intensity || 0, story.intensity || 0),
              _coverageCount: story._coverageCount || existing._coverageCount,
            });
          }
          this._stats.totalMerged++;
          continue;
        }
      }

      // ── Skip title dedup for redistributed articles (different country, same title is intentional) ──
      if (tk && !story._redistributed) {
        const existingId = this._titleIndex.get(tk);
        if (existingId) {
          const existing = this._stories.get(existingId);
          if (existing) {
            // Prefer article with higher source authority
            const srcRankNew = _srcRank(story.source);
            const srcRankOld = _srcRank(existing.source);
            if (srcRankNew > srcRankOld) {
              // Replace with better source but keep original ID to avoid cascade
              this._stories.set(existingId, { ...story, id: existingId, addedAt: existing.addedAt });
              if (uk) this._urlIndex.set(uk, existingId);
            } else if ((story.sourceCount || 1) > (existing.sourceCount || 1)) {
              this._stories.set(existingId, {
                ...existing,
                sourceCount:    story.sourceCount,
                _sources:       story._sources || existing._sources,
                _coverageCount: story._coverageCount || existing._coverageCount,
                intensity:      Math.max(existing.intensity || 0, story.intensity || 0),
              });
            }
            this._stats.totalMerged++;
            continue;
          }
        }
      }

      // ── Check by story.id (legacy/cluster ID) ──────────────────────────
      if (story.id && this._stories.has(story.id)) {
        const existing = this._stories.get(story.id);
        if ((story.sourceCount || 1) > (existing.sourceCount || 1)) {
          this._stories.set(story.id, { ...story, addedAt: existing.addedAt });
        }
        this._stats.totalMerged++;
        continue;
      }

      // ── Genuinely new story ─────────────────────────────────────────────
      const id = story.id || `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const entry = { ...story, id, addedAt: now };
      this._stories.set(id, entry);
      if (uk) this._urlIndex.set(uk, id);
      if (tk) this._titleIndex.set(tk, id);
      added.push(entry);
      this._stats.totalIngested++;
    }

    // 2. Trim to MAX_STORIES by trendScore
    if (this._stories.size > MAX_STORIES) {
      const sorted = [...this._stories.entries()]
        .sort((a, b) => (b[1].trendScore || 0) - (a[1].trendScore || 0));
      this._stories = new Map(sorted.slice(0, MAX_STORIES));
      this._rebuild();
    }

    this._lastUpdate = now;
    this._stats.updateCount++;
    return added;
  }

  getAll() {
    return [...this._stories.values()]
      .sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0));
  }

  getByCategory(cat) {
    return this.getAll().filter(s => cat === 'all' || s.category === cat);
  }

  getByCountry(country) {
    return this.getAll().filter(s => s.country === country);
  }

  getStats() {
    const byCat = {}, byCountry = {};
    for (const s of this._stories.values()) {
      byCat[s.category]    = (byCat[s.category]    || 0) + 1;
      byCountry[s.country] = (byCountry[s.country] || 0) + 1;
    }
    return {
      total:      this._stories.size,
      categories: byCat,
      countries:  Object.keys(byCountry).length,
      lastUpdate: this._lastUpdate,
      ...this._stats,
    };
  }
}

function _srcRank(src) {
  const R = {
    'Reuters':9,'AP':9,'Bloomberg':9,'AFP':8,'BBC':8,'BBC Sport':8,'BBC Football':8,
    'Guardian':7,'NYT':7,'Washington Post':7,'El País':7,'Le Monde':7,'DW':6,
    'Al Jazeera':6,'CNN':5,'ESPN':5,'Sky Sports':5,'ORBIT Intelligence':1,
  };
  return R[src] || 4;
}

export const store = new StoryStore();
