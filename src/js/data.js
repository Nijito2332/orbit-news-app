// ════════════════════════════════════════════════════════
//  ORBIT — Core Data: Categories + Trending
//  5 focused categories (not 10+) = denser, alive, premium
// ════════════════════════════════════════════════════════

// ORBIT color palette — coherent, space/tech aesthetic
// All hotspot colors in the blue/cyan/purple family so the globe looks premium
// Hotspot colors: single cyan family — clean, unified, premium
// Category distinction shown in cards/panel, not on the globe dot
export const CATEGORIES = {
  all:           { label:'All',          color:'#00D4FF', bg:'rgba(0,212,255,0.12)',   icon:'🌐' },
  world:         { label:'World',        color:'#00D4FF', bg:'rgba(0,212,255,0.12)',   icon:'🌍' },
  sports:        { label:'Sports',       color:'#00D4FF', bg:'rgba(0,212,255,0.12)',   icon:'⚽' },
  technology:    { label:'Technology',   color:'#818CF8', bg:'rgba(129,140,248,0.12)', icon:'💻' },
  gaming:        { label:'Gaming',       color:'#2DD4BF', bg:'rgba(45,212,191,0.12)',  icon:'🎮' },
  entertainment: { label:'Entertainment',color:'#00D4FF', bg:'rgba(0,212,255,0.12)',   icon:'🎬' },
  trending:      { label:'Trending',     color:'#00D4FF', bg:'rgba(0,212,255,0.12)',   icon:'🔥' },
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
