// ════════════════════════════════════════════════════════
//  ORBIT — Chronos Engine
//  Time-aware interest spawning + globe positioning
//  Detects local time → classifies slot → returns
//  the optimal globe camera position + category priority
// ════════════════════════════════════════════════════════

// Slot definitions: each slot maps to categories + globe spawn position
const SLOTS = {
  dawn: {
    hours: [5, 8],
    cats: ['technology', 'world'],
    globe: { lat: 40.7, lng: -74.0 },   // New York pre-market
    pace: 'slow',
    label: { en: 'Dawn', es: 'Amanecer', fr: 'Aube', de: 'Morgendämmerung' },
    mood: 'FOCUSED',
    bgHint: 'rgba(255,140,0,0.04)',       // warm dawn tint
  },
  morning: {
    hours: [8, 12],
    cats: ['world', 'technology'],
    globe: { lat: 51.5, lng: -0.1 },     // London — markets open
    pace: 'fast',
    label: { en: 'Morning', es: 'Mañana', fr: 'Matin', de: 'Morgen' },
    mood: 'ACTIVE',
    bgHint: 'rgba(0,212,255,0.04)',
  },
  noon: {
    hours: [12, 15],
    cats: ['world', 'sports'],
    globe: { lat: 40.4, lng: 10.0 },     // Central Europe midday
    pace: 'medium',
    label: { en: 'Noon', es: 'Mediodía', fr: 'Midi', de: 'Mittag' },
    mood: 'INFORMED',
    bgHint: 'rgba(0,255,136,0.03)',
  },
  afternoon: {
    hours: [15, 19],
    cats: ['entertainment', 'sports'],
    globe: { lat: 19.4, lng: -99.1 },    // Mexico City / LatAm
    pace: 'medium',
    label: { en: 'Afternoon', es: 'Tarde', fr: 'Après-midi', de: 'Nachmittag' },
    mood: 'ENERGIZED',
    bgHint: 'rgba(255,107,53,0.04)',
  },
  evening: {
    hours: [19, 23],
    cats: ['entertainment', 'gaming'],
    globe: { lat: 35.7, lng: 139.7 },    // Tokyo evening — gaming/streaming
    pace: 'fast',
    label: { en: 'Evening', es: 'Noche', fr: 'Soirée', de: 'Abend' },
    mood: 'SOCIAL',
    bgHint: 'rgba(123,47,190,0.06)',
  },
  night: {
    hours: [23, 2],
    cats: ['gaming', 'entertainment'],
    globe: { lat: 1.35, lng: 103.8 },    // Singapore — Asia night culture
    pace: 'slow',
    label: { en: 'Night', es: 'Madrugada', fr: 'Nuit', de: 'Nacht' },
    mood: 'CHILL',
    bgHint: 'rgba(0,50,120,0.06)',
  },
  deep_night: {
    hours: [2, 5],
    cats: ['gaming', 'technology'],
    globe: { lat: 35.0, lng: 105.0 },    // China deep night — tech/gaming
    pace: 'ambient',
    label: { en: 'Late Night', es: 'Trasnoche', fr: 'Nuit profonde', de: 'Spätnacht' },
    mood: 'AMBIENT',
    bgHint: 'rgba(0,20,60,0.08)',
  },
};

// ─── Core detection ───────────────────────────────────────────────────────────
function getLocalHour() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric', hour12: false });
  return parseInt(fmt.format(new Date()), 10);
}

function classifySlot(hour) {
  // handle midnight wrap-around for night/deep_night
  if (hour >= 5  && hour < 8)  return 'dawn';
  if (hour >= 8  && hour < 12) return 'morning';
  if (hour >= 12 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 19) return 'afternoon';
  if (hour >= 19 && hour < 23) return 'evening';
  if (hour >= 23 || hour < 2)  return 'night';
  return 'deep_night';
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function detect() {
  const hour    = getLocalHour();
  const slotKey = classifySlot(hour);
  const slot    = SLOTS[slotKey];
  const lang    = (navigator.language || 'en').slice(0, 2);

  return {
    hour,
    slotKey,
    slot,
    spawnLat:  slot.globe.lat,
    spawnLng:  slot.globe.lng,
    categories: slot.cats,
    pace:       slot.pace,
    mood:       slot.mood,
    label:      slot.label[lang] || slot.label.en,
    bgHint:     slot.bgHint,
    timezone:   Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// Priority order for sidebar categories based on chronos slot
export function getSidebarOrder(slotKey) {
  const slot = SLOTS[slotKey];
  if (!slot) return ['all', 'world', 'technology', 'sports', 'entertainment', 'gaming', 'trending'];
  const primary = slot.cats;
  const rest = ['world', 'technology', 'sports', 'entertainment', 'gaming'].filter(c => !primary.includes(c));
  return ['all', ...primary, ...rest, 'trending'];
}

// Record implicit interest signal (stored locally for dynamic sidebar)
const SIGNALS_KEY = 'orbit_signals_v1';
const DECAY_DAYS  = 7;

export function recordSignal(category, type, weight = 1.0) {
  const now = Date.now();
  try {
    const raw  = localStorage.getItem(SIGNALS_KEY);
    const sigs = raw ? JSON.parse(raw) : [];
    sigs.push({ category, type, weight, ts: now });
    // Keep only last 7 days
    const cutoff = now - DECAY_DAYS * 86400000;
    const trimmed = sigs.filter(s => s.ts > cutoff).slice(-200);
    localStorage.setItem(SIGNALS_KEY, JSON.stringify(trimmed));
  } catch (_) {}
}

// Compute implicit interest scores (decayed by age)
export function getImplicitInterests() {
  try {
    const raw  = localStorage.getItem(SIGNALS_KEY);
    if (!raw) return [];
    const sigs  = JSON.parse(raw);
    const now   = Date.now();
    const scores = {};
    for (const s of sigs) {
      const ageDays = (now - s.ts) / 86400000;
      const decayed = s.weight * Math.pow(0.92, ageDays);
      scores[s.category] = (scores[s.category] || 0) + decayed;
    }
    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .map(([cat]) => cat);
  } catch (_) { return []; }
}

// World clock data for PC sidebar
export const WORLD_CLOCKS = [
  { id: 'clk-nyc', city: 'NYC', tz: 'America/New_York'  },
  { id: 'clk-lon', city: 'LON', tz: 'Europe/London'     },
  { id: 'clk-mad', city: 'MAD', tz: 'Europe/Madrid'     },
  { id: 'clk-dxb', city: 'DXB', tz: 'Asia/Dubai'        },
  { id: 'clk-tky', city: 'TKY', tz: 'Asia/Tokyo'        },
];
