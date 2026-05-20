// ════════════════════════════════════════════════════════
//  ORBIT — Internationalization (EN / ES / FR / DE)
// ════════════════════════════════════════════════════════

export const SUPPORTED = {
  en: { label: 'EN', flag: '🇬🇧', name: 'English' },
  es: { label: 'ES', flag: '🇪🇸', name: 'Español' },
  fr: { label: 'FR', flag: '🇫🇷', name: 'Français' },
  de: { label: 'DE', flag: '🇩🇪', name: 'Deutsch' },
};

const T = {
  en: {
    // ─ Onboarding ─
    ob_title:   'The Future of News',
    ob_desc:    'Navigate the world. Discover stories that matter. Experience news like never before.',
    ob1_h:      'Navigate the Globe',
    ob1_p:      'Spin a live 3D Earth with real-time day/night. Tap glowing hotspots to explore stories.',
    ob2_h:      'Pick Your Interests',
    ob2_p:      'ORBIT\'s AI learns what you love. Select topics and shape your world.',
    ob3_h:      'Your World Awaits',
    ob3_p:      'Everything happening on Earth, beautifully visualized for you.',
    ob_explore: 'Explore',
    ob_next:    'Next',
    ob_continue:'Continue',
    ob_launch:  'Launch ORBIT',
    ob_skip:    'Skip intro',
    // ─ Topbar ─
    search_ph:  'Search news, topics, countries…',
    ai_brief:   'AI Brief',
    // ─ Sidebar ─
    lbl_categories: 'CATEGORIES',
    lbl_live:       'LIVE',
    lbl_live_text:  'stories updating',
    lbl_world_time: 'WORLD TIME',
    cat_all:           'All',
    cat_sports:        'Sports',
    cat_entertainment: 'Entertainment',
    cat_gaming:        'Gaming',
    cat_tech:          'Technology',
    cat_technology:    'Technology',
    cat_world:         'World',
    cat_trending:      'Trending',
    // Legacy keys kept for backwards compat
    cat_politics:'World', cat_science:'Technology', cat_finance:'World',
    cat_music:'Entertainment', cat_crypto:'Technology',
    // ─ News panel tabs ─
    tab_top:     'Top',
    tab_latest:  'Latest',
    tab_trending:'Trending',
    // ─ News cards ─
    rising:     'Rising',
    stable:     'Stable',
    no_stories: 'No stories found for this region',
    stories:    'stories',
    read_on:    'Read on The Guardian',
    read_time:  'min read',
    global_stories: 'Global stories',
    // ─ Article ─
    back:       'Back',
    ai_summary: '✦ AI SUMMARY',
    // ─ AI Brief panel ─
    ai_daily:   'AI Daily Brief',
    // ─ AI Brief sections ─
    brief_global:  'WORLD NEWS',
    brief_sports:  'SPORTS',
    brief_tech:    'TECHNOLOGY',
    brief_gaming:  'GAMING',
    brief_science: 'SCIENCE',
    brief_entertainment: 'ENTERTAINMENT',
    brief_finance: 'FINANCE',
    brief_crypto:  'CRYPTO',
    brief_music:   'MUSIC',
    brief_no_news: 'No live news available. Check your connection.',
    brief_powered: 'Generated from live Guardian news',
    // ─ Trending ─
    lbl_trending: 'TRENDING',
    // ─ Profile ─
    profile_free: 'ORBIT Free',
    profile_read: 'Read',
    profile_saved:'Saved',
    profile_countries:'Countries',
    upgrade_text: 'Unlock AI summaries, no ads, and exclusive sources',
    upgrade_btn:  'Upgrade — $4.99/mo',
    // ─ Globe controls ─
    news_note:  '📰 Live news in English · The Guardian',
  },

  es: {
    ob_title:   'El Futuro de las Noticias',
    ob_desc:    'Navega el mundo. Descubre historias que importan. Vive las noticias de otra manera.',
    ob1_h:      'Navega el Globo',
    ob1_p:      'Gira la Tierra 3D en directo con iluminación real. Toca los puntos brillantes para explorar.',
    ob2_h:      'Elige Tus Intereses',
    ob2_p:      'La IA de ORBIT aprende lo que te gusta. Elige temas y da forma a tu mundo.',
    ob3_h:      'Tu Mundo Te Espera',
    ob3_p:      'Todo lo que ocurre en la Tierra, visualizado de forma espectacular para ti.',
    ob_explore: 'Explorar',
    ob_next:    'Siguiente',
    ob_continue:'Continuar',
    ob_launch:  'Abrir ORBIT',
    ob_skip:    'Saltar intro',
    search_ph:  'Buscar noticias, temas, países…',
    ai_brief:   'Resumen IA',
    lbl_categories: 'CATEGORÍAS',
    lbl_live:       'EN VIVO',
    lbl_live_text:  'noticias actualizándose',
    lbl_world_time: 'HORA MUNDIAL',
    cat_all:'Todas', cat_sports:'Deportes', cat_entertainment:'Entretenimiento',
    cat_gaming:'Gaming', cat_tech:'Tecnología', cat_technology:'Tecnología',
    cat_world:'Mundo', cat_trending:'Tendencias',
    // Legacy
    cat_politics:'Mundo', cat_science:'Tecnología', cat_finance:'Mundo',
    cat_music:'Entretenimiento', cat_crypto:'Tecnología',
    tab_top:     'Principal',
    tab_latest:  'Recientes',
    tab_trending:'Tendencias',
    rising:     'Subiendo',
    stable:     'Estable',
    no_stories: 'No hay noticias para esta región',
    stories:    'noticias',
    read_on:    'Leer en The Guardian',
    read_time:  'min lectura',
    global_stories: 'Noticias globales',
    back:       'Volver',
    ai_summary: '✦ RESUMEN IA',
    ai_daily:   'Resumen Diario IA',
    brief_global:'NOTICIAS MUNDIALES', brief_sports:'DEPORTES', brief_tech:'TECNOLOGÍA',
    brief_gaming:'GAMING', brief_science:'CIENCIA', brief_entertainment:'ENTRETENIMIENTO',
    brief_finance:'FINANZAS', brief_crypto:'CRIPTO', brief_music:'MÚSICA',
    brief_no_news:'Sin noticias disponibles. Comprueba tu conexión.',
    brief_powered:'Generado desde noticias en vivo del Guardian',
    lbl_trending: 'TENDENCIAS',
    profile_free: 'ORBIT Gratis',
    profile_read: 'Leídas',
    profile_saved:'Guardadas',
    profile_countries:'Países',
    upgrade_text: 'Desbloquea resúmenes IA, sin anuncios y fuentes exclusivas',
    upgrade_btn:  'Actualizar — 4,99€/mes',
    news_note:  '📰 Noticias en inglés · The Guardian',
  },

  fr: {
    ob_title:   'Le Futur de l\'Actualité',
    ob_desc:    'Naviguez dans le monde. Découvrez les histoires qui comptent.',
    ob1_h:      'Naviguez le Globe',
    ob1_p:      'Faites tourner une Terre 3D en direct. Touchez les points lumineux pour explorer.',
    ob2_h:      'Choisissez Vos Intérêts',
    ob2_p:      'L\'IA d\'ORBIT apprend ce que vous aimez. Choisissez des thèmes et façonnez votre monde.',
    ob3_h:      'Votre Monde Vous Attend',
    ob3_p:      'Tout ce qui se passe sur Terre, magnifiquement visualisé pour vous.',
    ob_explore: 'Explorer',
    ob_next:    'Suivant',
    ob_continue:'Continuer',
    ob_launch:  'Lancer ORBIT',
    ob_skip:    'Passer l\'intro',
    search_ph:  'Rechercher des actualités, thèmes, pays…',
    ai_brief:   'Résumé IA',
    lbl_categories: 'CATÉGORIES',
    lbl_live:       'EN DIRECT',
    lbl_live_text:  'actus en mise à jour',
    lbl_world_time: 'HEURE MONDIALE',
    cat_all:'Toutes', cat_sports:'Sports', cat_entertainment:'Divertissement',
    cat_gaming:'Gaming', cat_tech:'Technologie', cat_technology:'Technologie',
    cat_world:'Monde', cat_trending:'Tendances',
    cat_politics:'Monde', cat_science:'Technologie',
    cat_finance:'Finance',
    cat_gaming: 'Gaming',
    cat_music:  'Musique',
    cat_crypto: 'Crypto',
    tab_top:     'À la une',
    tab_latest:  'Récentes',
    tab_trending:'Tendances',
    rising:     'En hausse',
    stable:     'Stable',
    no_stories: 'Aucune histoire pour cette région',
    stories:    'articles',
    read_on:    'Lire sur The Guardian',
    read_time:  'min de lecture',
    global_stories: 'Actualités mondiales',
    back:       'Retour',
    ai_summary: '✦ RÉSUMÉ IA',
    ai_daily:   'Résumé Quotidien IA',
    brief_global:'ACTUALITÉS MONDIALES', brief_sports:'SPORTS', brief_tech:'TECHNOLOGIE',
    brief_gaming:'GAMING', brief_science:'SCIENCE', brief_entertainment:'DIVERTISSEMENT',
    brief_finance:'FINANCE', brief_crypto:'CRYPTO', brief_music:'MUSIQUE',
    brief_no_news:'Aucune actualité disponible. Vérifiez votre connexion.',
    brief_powered:'Généré depuis les actualités Guardian en direct',
    lbl_trending: 'TENDANCES',
    profile_free: 'ORBIT Gratuit',
    profile_read: 'Lus',
    profile_saved:'Sauvegardés',
    profile_countries:'Pays',
    upgrade_text: 'Débloquez les résumés IA, sans pub et sources exclusives',
    upgrade_btn:  'S\'abonner — 4,99€/mois',
    news_note:  '📰 Actualités en anglais · The Guardian',
  },

  de: {
    ob_title:   'Die Zukunft der Nachrichten',
    ob_desc:    'Navigiere die Welt. Entdecke Geschichten, die wichtig sind.',
    ob1_h:      'Navigiere den Globus',
    ob1_p:      'Drehe eine Live-3D-Erde mit Echtzeit-Beleuchtung. Tippe auf Punkte zum Erkunden.',
    ob2_h:      'Wähle Deine Interessen',
    ob2_p:      'ORBITs KI lernt, was du liebst. Wähle Themen und gestalte deine Welt.',
    ob3_h:      'Deine Welt Wartet',
    ob3_p:      'Alles auf der Erde, wunderschön für dich visualisiert.',
    ob_explore: 'Erkunden',
    ob_next:    'Weiter',
    ob_continue:'Fortfahren',
    ob_launch:  'ORBIT Starten',
    ob_skip:    'Intro überspringen',
    search_ph:  'Nachrichten, Themen, Länder suchen…',
    ai_brief:   'KI-Zusammenfassung',
    lbl_categories: 'KATEGORIEN',
    lbl_live:       'LIVE',
    lbl_live_text:  'Nachrichten werden aktualisiert',
    lbl_world_time: 'WELTZEIT',
    cat_all:'Alle', cat_sports:'Sport', cat_entertainment:'Unterhaltung',
    cat_gaming:'Gaming', cat_tech:'Technologie', cat_technology:'Technologie',
    cat_world:'Welt', cat_trending:'Trending',
    cat_politics:'Welt', cat_science:'Technologie',
    cat_finance:'Finanzen',
    cat_gaming: 'Gaming',
    cat_music:  'Musik',
    cat_crypto: 'Krypto',
    tab_top:     'Top',
    tab_latest:  'Aktuell',
    tab_trending:'Trending',
    rising:     'Steigend',
    stable:     'Stabil',
    no_stories: 'Keine Nachrichten für diese Region',
    stories:    'Meldungen',
    read_on:    'Auf The Guardian lesen',
    read_time:  'Min. Lesezeit',
    global_stories: 'Weltweite Nachrichten',
    back:       'Zurück',
    ai_summary: '✦ KI-ZUSAMMENFASSUNG',
    ai_daily:   'KI-Tagesbericht',
    brief_global:'WELTNACHRICHTEN', brief_sports:'SPORT', brief_tech:'TECHNOLOGIE',
    brief_gaming:'GAMING', brief_science:'WISSENSCHAFT', brief_entertainment:'UNTERHALTUNG',
    brief_finance:'FINANZEN', brief_crypto:'KRYPTO', brief_music:'MUSIK',
    brief_no_news:'Keine Nachrichten verfügbar. Überprüfe deine Verbindung.',
    brief_powered:'Generiert aus Guardian-Nachrichten in Echtzeit',
    lbl_trending: 'TRENDING',
    profile_free: 'ORBIT Kostenlos',
    profile_read: 'Gelesen',
    profile_saved:'Gespeichert',
    profile_countries:'Länder',
    upgrade_text: 'KI-Zusammenfassungen, keine Werbung und exklusive Quellen',
    upgrade_btn:  'Upgrade — 4,99€/Monat',
    news_note:  '📰 Nachrichten auf Englisch · The Guardian',
  },
};

// ─── Runtime ──────────────────────────────────────────────────────────────────

function detectLang() {
  const saved = localStorage.getItem('orbit_lang');
  if (saved && T[saved]) return saved;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return T[browser] ? browser : 'en';
}

let _current = detectLang();

export function getLang()      { return _current; }
export function t(key)         { return (T[_current] || T.en)[key] || T.en[key] || key; }
export function setLang(lang)  {
  if (!T[lang]) return;
  _current = lang;
  localStorage.setItem('orbit_lang', lang);
  applyAll();
  // Dispatch event so components can react
  window.dispatchEvent(new CustomEvent('orbit:lang', { detail: lang }));
}

// Apply translations to all data-i18n elements in the DOM
export function applyAll() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    const val = t(key);
    if (val) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const val = t(key);
    if (val) el.title = val;
  });
}

export { T };
