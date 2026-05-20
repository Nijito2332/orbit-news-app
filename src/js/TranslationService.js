// ════════════════════════════════════════════════════════
//  ORBIT — Translation Service v2
//  Primary:  Google Translate (free, no key, supports 100+ langs)
//  Fallback: MyMemory (1000 words/day free)
//  Cache:    localStorage with 24h TTL
// ════════════════════════════════════════════════════════

const CACHE_KEY = 'orbit_tx_v3';
const CACHE_TTL = 24 * 3600 * 1000; // 24 hours

// ─── Cache helpers ────────────────────────────────────────────────────────────
let _mem = {};
try {
  const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  const now = Date.now();
  // Prune expired entries
  Object.entries(raw).forEach(([k, v]) => {
    if (now - (v.t || 0) < CACHE_TTL) _mem[k] = v;
  });
} catch(_) {}

function cacheGet(text, lang) {
  const k = `${lang}|${text.slice(0, 60)}`;
  return _mem[k]?.v || null;
}

function cacheSet(text, lang, translated) {
  const k = `${lang}|${text.slice(0, 60)}`;
  _mem[k] = { v: translated, t: Date.now() };
  try {
    if (Object.keys(_mem).length > 3000) {
      // Keep newest 1500
      const sorted = Object.entries(_mem).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
      _mem = Object.fromEntries(sorted.slice(0, 1500));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(_mem));
  } catch(_) {}
}

// ─── Google Translate free endpoint ──────────────────────────────────────────
async function translateGoogle(text, targetLang, signal) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`;
  const res  = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const data = await res.json();
  // data[0] = array of [translated_segment, original_segment]
  const result = (data[0] || []).map(s => s[0] || '').join('');
  if (!result || result.length < 2) throw new Error('Empty translation');
  return result;
}

// ─── MyMemory fallback ────────────────────────────────────────────────────────
async function translateMyMemory(text, targetLang, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 400))}&langpair=auto|${targetLang}`;
  const res  = await fetch(url, { signal });
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error('MyMemory failed');
  const tx = data.responseData?.translatedText || '';
  if (!tx || tx.toLowerCase().includes('mymemory')) throw new Error('MyMemory limit');
  return tx;
}

// ─── Single text translation with cache ──────────────────────────────────────
export async function translateText(text, targetLang) {
  if (!text || !text.trim() || targetLang === 'en') return text;

  // Normalize lang codes for Google
  const gtLang = { 'zh': 'zh-CN', 'pt': 'pt-BR' }[targetLang] || targetLang;

  // Check cache first
  const cached = cacheGet(text, gtLang);
  if (cached) return cached;

  const signal = AbortSignal.timeout(5000);

  try {
    const result = await translateGoogle(text, gtLang, signal);
    cacheSet(text, gtLang, result);
    return result;
  } catch(_) {
    try {
      const result = await translateMyMemory(text, targetLang, signal);
      cacheSet(text, targetLang, result);
      return result;
    } catch(__) {
      return text; // Graceful fallback to original
    }
  }
}

// ─── Batch translate news items ───────────────────────────────────────────────
// Translates title + summary for each item
// Uses concurrency limit to avoid rate limiting
export async function translateNews(items, targetLang) {
  if (targetLang === 'en' || !items?.length) return items;

  const CONCURRENCY = 4;
  const result = [...items];

  for (let i = 0; i < result.length; i += CONCURRENCY) {
    const batch = result.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (item, j) => {
      try {
        const [title, summary] = await Promise.all([
          translateText(item.title || '', targetLang),
          translateText((item.summary || '').slice(0, 250), targetLang),
        ]);
        result[i + j] = {
          ...item,
          title:       title  || item.title,
          summary:     summary || item.summary,
          _translated: targetLang,
        };
      } catch(_) {
        // Keep original on error
      }
    }));
  }

  return result;
}

export function clearCache() {
  _mem = {};
  localStorage.removeItem(CACHE_KEY);
}
