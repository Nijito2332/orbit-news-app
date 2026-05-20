// ════════════════════════════════════════════════════════
//  ORBIT — Core Data: Categories + Trending
//  5 focused categories (not 10+) = denser, alive, premium
// ════════════════════════════════════════════════════════

export const CATEGORIES = {
  all:           { label:'All',          color:'#00D4FF', bg:'rgba(0,212,255,0.12)',  icon:'🌐' },
  sports:        { label:'Sports',       color:'#00D4FF', bg:'rgba(0,212,255,0.12)',  icon:'⚽' },
  entertainment: { label:'Entertainment',color:'#FBBF24', bg:'rgba(251,191,36,0.12)', icon:'🎬' },
  gaming:        { label:'Gaming',       color:'#A3E635', bg:'rgba(163,230,53,0.12)', icon:'🎮' },
  technology:    { label:'Technology',   color:'#A78BFA', bg:'rgba(167,139,250,0.12)',icon:'💻' },
  world:         { label:'World',        color:'#FB923C', bg:'rgba(251,146,60,0.12)', icon:'🌍' },
  trending:      { label:'Trending',     color:'#FF4757', bg:'rgba(255,71,87,0.12)',  icon:'🔥' },
};

export const COUNTRY_FLAGS = {
  UK:'🇬🇧', US:'🇺🇸', ES:'🇪🇸', FR:'🇫🇷', DE:'🇩🇪',
  JP:'🇯🇵', CN:'🇨🇳', BR:'🇧🇷', IN:'🇮🇳', AU:'🇦🇺',
  KR:'🇰🇷', RU:'🇷🇺', CA:'🇨🇦', MX:'🇲🇽', AR:'🇦🇷',
  AE:'🇦🇪', NG:'🇳🇬', ZA:'🇿🇦', IT:'🇮🇹', PT:'🇵🇹',
  NL:'🇳🇱', SE:'🇸🇪', SA:'🇸🇦', TR:'🇹🇷', PL:'🇵🇱',
  UA:'🇺🇦', CH:'🇨🇭', NO:'🇳🇴', SG:'🇸🇬', ID:'🇮🇩',
};

// Trending topics (refreshed dynamically in production)
export function getTrendingTopics() {
  return [
    { label:'Champions League', count:'2.8M posts' },
    { label:'OpenAI GPT-5',     count:'1.9M posts' },
    { label:'NBA Finals',       count:'1.6M posts' },
    { label:'Formula 1',        count:'1.2M posts' },
    { label:'PlayStation 6',    count:'980K posts' },
    { label:'Apple Vision',     count:'870K posts' },
    { label:'World Cup 2026',   count:'760K posts' },
    { label:'K-Pop Awards',     count:'650K posts' },
    { label:'Mars Mission',     count:'540K posts' },
    { label:'Taylor Swift',     count:'1.5M posts' },
  ];
}

// AI Brief static fallback (overridden dynamically from live news)
export function getAIBrief() { return []; }

// Demo news (minimal fallback only — app always uses live Guardian/RSS)
export const NEWS_DATA = [];
