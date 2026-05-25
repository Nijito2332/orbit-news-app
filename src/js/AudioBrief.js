/**
 * AudioBrief — Text-to-Speech Daily Briefing
 *
 * Uses the Web Speech API (free, built into every browser).
 * No external API needed. Works offline on device.
 * ORBIT+ feature — gated for free users.
 *
 * @module AudioBrief
 */

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** @type {SpeechSynthesisUtterance|null} */
let _current = null;
let _playing  = false;

// ── Voice selection — prefer neural/natural voices ────────────────────────────
function pickVoice(lang) {
  if (!SUPPORTED) return null;
  const voices = window.speechSynthesis.getVoices();
  const langCode = lang.slice(0, 2).toLowerCase();

  // Priority: Google neural > Microsoft neural > any matching lang
  const priority = [
    v => v.name.includes('Google') && v.lang.startsWith(langCode),
    v => v.name.includes('Microsoft') && v.lang.startsWith(langCode),
    v => v.lang.startsWith(langCode) && !v.name.includes('eSpeak'),
    v => v.lang.startsWith(langCode),
    v => v.lang.startsWith('en'),   // ultimate fallback
  ];

  for (const test of priority) {
    const match = voices.find(test);
    if (match) return match;
  }
  return null;
}

// ── Build the briefing script ─────────────────────────────────────────────────
function buildScript(brief, lang) {
  const isES = lang === 'es';
  const isFR = lang === 'fr';
  const isDE = lang === 'de';

  const date = new Date().toLocaleDateString(lang, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const greetings = {
    es: `Buenos días. Tu Resumen Diario ORBIT del ${date}.`,
    fr: `Bonjour. Voici votre Brief du Jour ORBIT du ${date}.`,
    de: `Guten Tag. Ihr täglicher ORBIT-Überblick vom ${date}.`,
    en: `Good day. Here is your ORBIT Daily Brief for ${date}.`,
  };

  const closings = {
    es: 'Eso es todo por ahora. Mantente informado con ORBIT.',
    fr: "C'est tout pour le moment. Restez informé avec ORBIT.",
    de: 'Das war alles für jetzt. Bleiben Sie mit ORBIT informiert.',
    en: 'That is all for now. Stay informed with ORBIT.',
  };

  const intro   = greetings[lang] || greetings.en;
  const closing = closings[lang]  || closings.en;

  const stories = brief.items.slice(0, 5).map((item, i) => {
    const num    = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][i] || `Story ${i + 1}`;
    const impact = item.intensity > 0.8 ? (isES ? 'Noticia crítica' : 'Breaking story') : '';
    const why    = item._whySentence || '';
    return `${impact}. ${item.title}. ${(item.summary || '').slice(0, 120)}.`;
  }).join(' ');

  const moodLine = {
    es: `El estado global del mundo hoy es: ${brief.mood}.`,
    fr: `L'état global du monde aujourd'hui est : ${brief.mood}.`,
    de: `Der globale Zustand der Welt heute ist: ${brief.mood}.`,
    en: `The global mood today is: ${brief.mood}.`,
  }[lang] || '';

  return [intro, moodLine, stories, closing].filter(Boolean).join(' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Play audio brief.
 * @param {Object}   brief   — output from UIManager._buildBrief()
 * @param {string}   lang    — 'es'|'en'|'fr'|'de'
 * @param {Function} onStart — called when speech begins
 * @param {Function} onEnd   — called when speech finishes
 * @param {Function} onError — called on error
 */
export function playBrief(brief, lang = 'en', { onStart, onEnd, onError } = {}) {
  if (!SUPPORTED) {
    onError?.('Speech synthesis not supported in this browser.');
    return;
  }

  // Cancel any ongoing speech
  stopBrief();

  const script  = buildScript(brief, lang);
  const utter   = new SpeechSynthesisUtterance(script);

  // Wait for voices to load (Chrome async issue)
  const startWithVoice = () => {
    const voice  = pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.lang  = lang + '-' + (lang === 'en' ? 'GB' : lang.toUpperCase());
    utter.rate  = 0.95;   // slightly slower = more premium feel
    utter.pitch = 1.0;
    utter.volume = 1.0;

    utter.onstart = () => { _playing = true;  onStart?.(); };
    utter.onend   = () => { _playing = false; _current = null; onEnd?.(); };
    utter.onerror = (e) => { _playing = false; _current = null; onError?.(e.error); };

    _current = utter;
    window.speechSynthesis.speak(utter);
  };

  // Chrome loads voices async
  if (window.speechSynthesis.getVoices().length > 0) {
    startWithVoice();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      startWithVoice();
    };
    // Trigger voice load
    window.speechSynthesis.getVoices();
    // Fallback timeout
    setTimeout(() => {
      if (!_playing) startWithVoice();
    }, 500);
  }
}

export function stopBrief() {
  if (!SUPPORTED) return;
  window.speechSynthesis.cancel();
  _playing = false;
  _current = null;
}

export function pauseBrief() {
  if (!SUPPORTED || !_playing) return;
  window.speechSynthesis.pause();
}

export function resumeBrief() {
  if (!SUPPORTED) return;
  window.speechSynthesis.resume();
}

export function isPlaying() { return _playing; }
export function isAvailable() { return SUPPORTED; }
