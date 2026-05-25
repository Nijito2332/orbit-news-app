/**
 * TimeContextEngine — Feed adaptation by time slot
 *
 * Maps the user's local time to content priorities.
 * Affects: article scoring, hotspot intensity, sidebar order.
 *
 * @module TimeContextEngine
 */

// ── Time slot profiles ────────────────────────────────────────────────────────
const SLOT_PROFILES = {
  dawn: {        // 05-08
    boost:    ['technology', 'world'],
    suppress: ['gaming', 'entertainment'],
    ageHours: 6,          // prefer fresh news
    paceMulti: 0.7,       // slower scroll speed
    worldFocus: true,     // show global scope
  },
  morning: {     // 08-12
    boost:    ['world', 'technology'],
    suppress: ['gaming'],
    ageHours: 4,
    paceMulti: 1.2,       // faster pace
    worldFocus: true,
  },
  noon: {        // 12-15
    boost:    ['sports', 'world', 'entertainment'],
    suppress: [],
    ageHours: 6,
    paceMulti: 1.0,
    worldFocus: false,
  },
  afternoon: {   // 15-19
    boost:    ['sports', 'entertainment'],
    suppress: ['technology'],
    ageHours: 8,
    paceMulti: 1.0,
    worldFocus: false,
  },
  evening: {     // 19-23
    boost:    ['entertainment', 'gaming', 'sports'],
    suppress: [],
    ageHours: 12,
    paceMulti: 0.85,
    worldFocus: false,
  },
  night: {       // 23-02
    boost:    ['gaming', 'entertainment', 'technology'],
    suppress: ['world'],
    ageHours: 24,
    paceMulti: 0.6,
    worldFocus: false,
  },
  deep_night: {  // 02-05
    boost:    ['technology', 'gaming'],
    suppress: ['sports', 'world'],
    ageHours: 48,
    paceMulti: 0.4,
    worldFocus: false,
  },
};

/**
 * Score a single article given the current time slot.
 * Returns a number in [0, 3] to add to the base composite score.
 * @param {Object} article
 * @param {string} slotKey
 * @returns {number}
 */
export function timeScore(article, slotKey) {
  const profile = SLOT_PROFILES[slotKey] || SLOT_PROFILES.morning;
  let bonus = 0;

  // Category boost / suppress
  if (profile.boost.includes(article.category))    bonus += 0.8;
  if (profile.suppress.includes(article.category)) bonus -= 0.5;

  // Freshness gate: articles older than profile.ageHours lose priority
  const ageH = (Date.now() - (article.timestamp || 0)) / 3600000;
  if (ageH <= profile.ageHours) bonus += 0.4;
  else bonus -= Math.min((ageH - profile.ageHours) / profile.ageHours, 0.6);

  return bonus;
}

/**
 * Re-sort a pool of articles using time-context scoring.
 * Preserves the base trendScore while adding temporal layer.
 * @param {Object[]} articles
 * @param {string}   slotKey  — from ChronosEngine.detect().slotKey
 * @returns {Object[]} re-sorted articles
 */
export function adaptFeedToTime(articles, slotKey) {
  if (!articles?.length) return articles;
  return [...articles]
    .map(a => ({ ...a, _timeScore: (a.trendScore || a.intensity || 0.5) + timeScore(a, slotKey) }))
    .sort((a, b) => b._timeScore - a._timeScore);
}

/**
 * Given a slot, return the world clock cities to highlight
 * (markets that are open right now → glow brighter).
 * @param {number} hour  — local hour 0-23
 * @returns {string[]}   — city ids that are "active"
 */
export function getActiveMarkets(hour) {
  // NYC  09:30-16:00 ET  → UTC 14:30-21:00  (approx local 14-21 in Europe)
  // LON  08:00-16:30 BST → UTC 07:00-15:30
  // TKY  09:00-15:30 JST → UTC 00:00-06:30
  // Simplified: mark as active if major exchange is likely open
  const active = [];
  if (hour >= 9  && hour < 17)  active.push('clk-lon');
  if (hour >= 14 && hour < 22)  active.push('clk-nyc');
  if (hour >= 9  && hour < 18)  active.push('clk-mad');
  if (hour >= 9  && hour < 18)  active.push('clk-dxb');
  if (hour >= 0  && hour < 7)   active.push('clk-tky');
  if (hour >= 18)               active.push('clk-tky');
  return active;
}

/**
 * Compute a "news activity" heatmap level (0-1) for a given hour.
 * Drives ambient glow intensity in the living background.
 * @param {number} hour
 * @returns {number}
 */
export function activityLevel(hour) {
  // Peaks: 08-10 (morning burst), 13-14 (lunch), 18-20 (evening prime)
  const curve = [
    0.2, 0.15, 0.12, 0.10, 0.10, 0.20,   // 00-05
    0.35, 0.55, 0.80, 0.90, 0.85, 0.78,  // 06-11
    0.75, 0.82, 0.80, 0.72, 0.70, 0.75,  // 12-17
    0.90, 0.95, 0.88, 0.75, 0.60, 0.40,  // 18-23
  ];
  return curve[Math.min(hour, 23)] || 0.5;
}
