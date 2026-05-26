// ════════════════════════════════════════════════════════
//  ORBIT Server — All News Sources
//  130+ sources — most influential per country
// ════════════════════════════════════════════════════════

export const GUARDIAN_KEY = process.env.GUARDIAN_KEY || 'test';
export const GUARDIAN_API = 'https://content.guardianapis.com';

export const GROQ_KEY = process.env.GROQ_KEY || null; // Optional: free at console.groq.com

// Guardian section-level bulk queries (5 calls × 50 articles = 250)
export const GUARDIAN_BULK = [
  { sections: 'sport,football',                                        cat: 'sports',        size: 50 },
  { sections: 'film,music,television,culture,arts,stage,lifeandstyle', cat: 'entertainment', size: 50 },
  { sections: 'games',                                                  cat: 'gaming',        size: 50 },
  { sections: 'technology,science,environment',                         cat: 'technology',    size: 50 },
  { sections: 'world,us-news,uk-news,politics,business,money',         cat: 'world',         size: 50 },
];

const DW  = 'https://rss.dw.com/rdf';
const BBC = 'https://feeds.bbci.co.uk';

// ─── SERVER-SIDE ONLY feeds (no CORS limitation on Node.js!) ─────────────────
export const SERVER_ONLY_FEEDS = [
  // ── GAMING — top global publications ──
  { url:'https://www.ign.com/articles.rss',                    src:'IGN',                country:'US', cat:'gaming',        lang:'en' },
  { url:'https://kotaku.com/rss',                              src:'Kotaku',             country:'US', cat:'gaming',        lang:'en' },
  { url:'https://www.eurogamer.net/?format=rss',               src:'Eurogamer',          country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.polygon.com/rss/index.xml',               src:'Polygon',            country:'US', cat:'gaming',        lang:'en' },
  { url:'https://www.gamespot.com/feeds/news/',                src:'GameSpot',           country:'US', cat:'gaming',        lang:'en' },
  { url:'https://www.rockpapershotgun.com/feed',               src:'Rock Paper Shotgun', country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.pcgamer.com/rss/',                        src:'PC Gamer',           country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.destructoid.com/feed/',                   src:'Destructoid',        country:'US', cat:'gaming',        lang:'en' },
  { url:'https://www.dexerto.com/feed/',                       src:'Dexerto',            country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.vg247.com/feed',                          src:'VG247',              country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.nintendolife.com/feeds/latest',           src:'Nintendo Life',      country:'UK', cat:'gaming',        lang:'en' },
  { url:'https://www.pushsquare.com/feeds/latest',             src:'Push Square',        country:'UK', cat:'gaming',        lang:'en' },

  // ── ENTERTAINMENT — Hollywood, music, streaming ──
  { url:'https://variety.com/feed/',                           src:'Variety',            country:'US', cat:'entertainment', lang:'en' },
  { url:'https://deadline.com/feed/',                          src:'Deadline',           country:'US', cat:'entertainment', lang:'en' },
  { url:'https://www.hollywoodreporter.com/feed/',             src:'Hollywood Reporter', country:'US', cat:'entertainment', lang:'en' },
  { url:'https://www.rollingstone.com/feed/',                  src:'Rolling Stone',      country:'US', cat:'entertainment', lang:'en' },
  { url:'https://pitchfork.com/rss/news/feed/r.xml',          src:'Pitchfork',          country:'US', cat:'entertainment', lang:'en' },
  { url:'https://www.nme.com/feed',                            src:'NME',                country:'UK', cat:'entertainment', lang:'en' },
  { url:'https://www.billboard.com/feed/',                     src:'Billboard',          country:'US', cat:'entertainment', lang:'en' },
  { url:'https://www.thewrap.com/feed/',                       src:'The Wrap',           country:'US', cat:'entertainment', lang:'en' },
  { url:'https://www.cinemablend.com/rss/news',               src:'CinemaBlend',        country:'US', cat:'entertainment', lang:'en' },
  { url:'https://screenrant.com/feed/',                        src:'Screen Rant',        country:'US', cat:'entertainment', lang:'en' },

  // ── TECHNOLOGY — top global tech publications ──
  { url:'https://techcrunch.com/feed/',                        src:'TechCrunch',         country:'US', cat:'technology',    lang:'en' },
  { url:'https://www.theverge.com/rss/index.xml',             src:'The Verge',          country:'US', cat:'technology',    lang:'en' },
  { url:'https://feeds.arstechnica.com/arstechnica/index',    src:'Ars Technica',       country:'US', cat:'technology',    lang:'en' },
  { url:'https://www.wired.com/feed/rss',                     src:'Wired',              country:'US', cat:'technology',    lang:'en' },
  { url:'https://www.engadget.com/rss.xml',                   src:'Engadget',           country:'US', cat:'technology',    lang:'en' },
  { url:'https://9to5mac.com/feed/',                           src:'9to5Mac',            country:'US', cat:'technology',    lang:'en' },
  { url:'https://9to5google.com/feed/',                        src:'9to5Google',         country:'US', cat:'technology',    lang:'en' },
  { url:'https://venturebeat.com/feed/',                       src:'VentureBeat',        country:'US', cat:'technology',    lang:'en' },
  { url:'https://thenextweb.com/feed/',                        src:'The Next Web',       country:'NL', cat:'technology',    lang:'en' },

  // ── SPORTS — top global sports publications ──
  { url:'https://www.90min.com/rss.xml',                       src:'90min',              country:'UK', cat:'sports',        lang:'en' },
  { url:'https://www.goal.com/en/feeds/news?fmt=rss',         src:'Goal.com',           country:'UK', cat:'sports',        lang:'en' },
  { url:'https://www.cbssports.com/rss/headlines/',            src:'CBS Sports',         country:'US', cat:'sports',        lang:'en' },
  { url:'https://www.espn.com/espn/rss/news',                 src:'ESPN',               country:'US', cat:'sports',        lang:'en' },
  { url:'https://bleacherreport.com/articles/feed',            src:'Bleacher Report',    country:'US', cat:'sports',        lang:'en' },
  { url:'https://www.skysports.com/rss/12040',                src:'Sky Sports',         country:'UK', cat:'sports',        lang:'en' },
];

// RSS feeds — standard (direct on server)
export const RSS_SOURCES = [
  // ── DW (Deutsche Welle — 20+ languages) ──
  { url:`${DW}/rss-en-top`, src:'DW World',        country:'DE', cat:'world',         lang:'en' },
  { url:`${DW}/rss-en-sp3`, src:'DW Sports EN',    country:'UK', cat:'sports',        lang:'en' },
  { url:`${DW}/rss-en-cul`, src:'DW Culture EN',   country:'UK', cat:'entertainment', lang:'en' },
  { url:`${DW}/rss-en-cns`, src:'DW Science EN',   country:'DE', cat:'technology',    lang:'en' },
  { url:`${DW}/rss-en-eco`, src:'DW Economy EN',   country:'DE', cat:'world',         lang:'en' },
  { url:`${DW}/rss-sp-pol`, src:'DW Español',      country:'ES', cat:'world',         lang:'es' },
  { url:`${DW}/rss-sp-sp3`, src:'DW Deportes',     country:'ES', cat:'sports',        lang:'es' },
  { url:`${DW}/rss-sp-eco`, src:'DW Economía',     country:'ES', cat:'world',         lang:'es' },
  { url:`${DW}/rss-sp-cul`, src:'DW Cultura ES',   country:'ES', cat:'entertainment', lang:'es' },
  { url:`${DW}/rss-sp-cns`, src:'DW Ciencia ES',   country:'ES', cat:'technology',    lang:'es' },
  { url:`${DW}/rss-sp-all`, src:'DW MX',           country:'MX', cat:'world',         lang:'es' },
  { url:`${DW}/rss-fr-pol`, src:'DW France',       country:'FR', cat:'world',         lang:'fr' },
  { url:`${DW}/rss-fr-sp3`, src:'DW Sport FR',     country:'FR', cat:'sports',        lang:'fr' },
  { url:`${DW}/rss-fr-eco`, src:"DW Éco FR",       country:'FR', cat:'world',         lang:'fr' },
  { url:`${DW}/rss-fr-cul`, src:'DW Culture FR',   country:'FR', cat:'entertainment', lang:'fr' },
  { url:`${DW}/rss-de-pol`, src:'DW Politik',      country:'DE', cat:'world',         lang:'de' },
  { url:`${DW}/rss-de-sp3`, src:'DW Sport DE',     country:'DE', cat:'sports',        lang:'de' },
  { url:`${DW}/rss-de-eco`, src:'DW Wirtschaft',   country:'DE', cat:'world',         lang:'de' },
  { url:`${DW}/rss-de-cul`, src:'DW Kultur',       country:'DE', cat:'entertainment', lang:'de' },
  { url:`${DW}/rss-de-cns`, src:'DW Wissen',       country:'DE', cat:'technology',    lang:'de' },
  { url:`${DW}/rss-ar-ara`, src:'DW عربي',         country:'SA', cat:'world',         lang:'ar' },
  { url:`${DW}/rss-br-top`, src:'DW Brasil',       country:'BR', cat:'world',         lang:'pt' },
  { url:`${DW}/rss-br-sp3`, src:'DW Esportes BR',  country:'BR', cat:'sports',        lang:'pt' },
  { url:`${DW}/rss-ru-rus`, src:'DW Русский',      country:'RU', cat:'world',         lang:'ru' },
  { url:`${DW}/rss-tr-tur`, src:'DW Türkçe',       country:'TR', cat:'world',         lang:'tr' },
  { url:`${DW}/rss-uk-ukr`, src:'DW Українська',  country:'UA', cat:'world',         lang:'uk' },
  { url:`${DW}/rss-id-ind`, src:'DW Indonesia',    country:'ID', cat:'world',         lang:'id' },
  { url:`${DW}/rss-ko-kor`, src:'DW 한국어',        country:'KR', cat:'world',         lang:'ko' },
  { url:`${DW}/rss-hi-ind`, src:'DW हिन्दी',       country:'IN', cat:'world',         lang:'hi' },
  { url:`${DW}/rss-ms-mas`, src:'DW Melayu',       country:'MY', cat:'world',         lang:'ms' },
  { url:`${DW}/rss-vi-vie`, src:'DW Việt',         country:'VN', cat:'world',         lang:'vi' },
  { url:`${DW}/rss-sw-swa`, src:'DW Kiswahili',    country:'KE', cat:'world',         lang:'sw' },

  // ── BBC (UK public broadcaster) ──
  { url:`${BBC}/sport/rss.xml`,                              src:'BBC Sport',       country:'UK', cat:'sports',        lang:'en' },
  { url:`${BBC}/news/world/rss.xml`,                         src:'BBC World',       country:'UK', cat:'world',         lang:'en' },
  { url:`${BBC}/news/technology/rss.xml`,                    src:'BBC Tech',        country:'UK', cat:'technology',    lang:'en' },
  { url:`${BBC}/news/entertainment_and_arts/rss.xml`,        src:'BBC Culture',     country:'UK', cat:'entertainment', lang:'en' },
  { url:`${BBC}/news/science_and_environment/rss.xml`,       src:'BBC Science',     country:'UK', cat:'technology',    lang:'en' },
  { url:`${BBC}/news/business/rss.xml`,                      src:'BBC Business',    country:'UK', cat:'world',         lang:'en' },
  { url:`${BBC}/mundo/rss.xml`,                              src:'BBC Mundo',       country:'ES', cat:'world',         lang:'es' },

  // ── International broadcasters ──
  { url:'https://www.france24.com/en/rss',                   src:'France 24 EN',    country:'FR', cat:'world',         lang:'en' },
  { url:'https://www.france24.com/fr/rss',                   src:'France 24 FR',    country:'FR', cat:'world',         lang:'fr' },
  { url:'https://www.abc.net.au/news/feed/51120/rss.xml',    src:'ABC Australia',   country:'AU', cat:'world',         lang:'en' },
  { url:'https://www.aljazeera.com/xml/rss/all.xml',         src:'Al Jazeera',      country:'SA', cat:'world',         lang:'en' },
  { url:'https://rss.cbc.ca/lineup/topstories.xml',          src:'CBC Canada',      country:'CA', cat:'world',         lang:'en' },
  { url:'https://www3.nhk.or.jp/rss/news/cat0.xml',          src:'NHK Japan',       country:'JP', cat:'world',         lang:'ja' },
  { url:'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', src:'Times of India', country:'IN', cat:'world', lang:'en' },

  // ── España — las fuentes más influyentes ──
  // Generalistas / Mundo
  { url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',    src:'El País',         country:'ES', cat:'world',         lang:'es' },
  { url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/espana',     src:'El País España',  country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.elmundo.es/rss/portada.xml',                               src:'El Mundo',        country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.lavanguardia.com/rss/home.xml',                            src:'La Vanguardia',   country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.elconfidencial.com/rss/espana.xml',                        src:'El Confidencial', country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.rtve.es/api/noticias.rss',                                 src:'RTVE',            country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.abc.es/rss/feeds/abc_ultima.xml',                          src:'ABC España',      country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.elperiodico.com/es/rss/rss_portada.xml',                  src:'El Periódico',    country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.eldiario.es/rss/',                                          src:'elDiario.es',     country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.eleconomista.es/rss/rss-seleccion-ee.php',                src:'El Economista',   country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.elconfidencial.com/rss/economia.xml',                      src:'EC Economía',     country:'ES', cat:'world',         lang:'es' },
  { url:'https://www.20minutos.es/rss/',                                         src:'20minutos',       country:'ES', cat:'world',         lang:'es' },
  // Deportes ES
  { url:'https://e00-marca.uecdn.es/rss/portada.xml',                           src:'Marca',           country:'ES', cat:'sports',        lang:'es' },
  { url:'https://www.as.com/rss.xml',                                            src:'AS',              country:'ES', cat:'sports',        lang:'es' },
  { url:'https://www.mundodeportivo.com/rss/',                                   src:'Mundo Deportivo', country:'ES', cat:'sports',        lang:'es' },
  { url:'https://www.sport.es/rss/deportes.rss',                                src:'Sport',           country:'ES', cat:'sports',        lang:'es' },
  { url:'https://www.abc.es/rss/feeds/abc_deportes.xml',                        src:'ABC Deportes',    country:'ES', cat:'sports',        lang:'es' },
  { url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/deportes',   src:'El País Deporte', country:'ES', cat:'sports',        lang:'es' },
  { url:'https://www.lavanguardia.com/rss/deportes.xml',                        src:'LV Deportes',     country:'ES', cat:'sports',        lang:'es' },
  // Tecnología ES
  { url:'https://www.xataka.com/index.xml',                                      src:'Xataka',          country:'ES', cat:'technology',    lang:'es' },
  { url:'https://www.xatakandroid.com/index.xml',                               src:'Xataka Android',  country:'ES', cat:'technology',    lang:'es' },
  { url:'https://www.applesfera.com/index.xml',                                  src:'Applesfera',      country:'ES', cat:'technology',    lang:'es' },
  { url:'https://www.elconfidencial.com/rss/tecnologia.xml',                    src:'EC Tech',         country:'ES', cat:'technology',    lang:'es' },
  { url:'https://www.computerhoy.com/feed',                                      src:'Computer Hoy',    country:'ES', cat:'technology',    lang:'es' },
  { url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/tecnologia', src:'El País Tech',    country:'ES', cat:'technology',    lang:'es' },
  // Gaming ES
  { url:'https://www.3djuegos.com/rss.php',                                      src:'3DJuegos',        country:'ES', cat:'gaming',        lang:'es' },
  { url:'https://vandal.elespanol.com/rss',                                      src:'Vandal',          country:'ES', cat:'gaming',        lang:'es' },
  { url:'https://www.hobbyconsolas.com/rss/',                                   src:'HobbyConsolas',   country:'ES', cat:'gaming',        lang:'es' },
  { url:'https://as.com/meristation/rss.xml',                                    src:'MeriStation',     country:'ES', cat:'gaming',        lang:'es' },
  // Entretenimiento ES
  { url:'https://www.formulatv.com/rss/',                                        src:'FormulaTV',       country:'ES', cat:'entertainment', lang:'es' },
  { url:'https://www.espinof.com/feed',                                          src:'Espinof',         country:'ES', cat:'entertainment', lang:'es' },
  { url:'https://www.sensacine.com/rss/noticias.xml',                           src:'SensaCine',       country:'ES', cat:'entertainment', lang:'es' },
  { url:'https://www.abc.es/rss/feeds/abc_gente.xml',                           src:'ABC Gente',       country:'ES', cat:'entertainment', lang:'es' },
  { url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/cultura',    src:'El País Cultura', country:'ES', cat:'entertainment', lang:'es' },
  { url:'https://www.rtve.es/api/noticias-rss/television.rss',                  src:'RTVE TV',         country:'ES', cat:'entertainment', lang:'es' },

  // ── France — sources les plus influentes ──
  { url:'https://www.lemonde.fr/rss/une.xml',                 src:'Le Monde',        country:'FR', cat:'world',         lang:'fr' },
  { url:'https://www.lefigaro.fr/rss/figaro_actualites.xml',  src:'Le Figaro',       country:'FR', cat:'world',         lang:'fr' },
  { url:'https://www.bfmtv.com/rss/news-24-7/',              src:'BFM TV',          country:'FR', cat:'world',         lang:'fr' },
  { url:'https://www.tf1info.fr/rss.xml',                     src:'TF1 Info',        country:'FR', cat:'world',         lang:'fr' },
  { url:'https://feeds.leparisien.fr/leparisien/rss',         src:'Le Parisien',     country:'FR', cat:'world',         lang:'fr' },
  { url:'https://www.lequipe.fr/rss/actu_rss.xml',           src:"L'Équipe",        country:'FR', cat:'sports',        lang:'fr' },
  { url:'https://www.jeuxvideo.com/rss/rss.xml',              src:'Jeux Vidéo',      country:'FR', cat:'gaming',        lang:'fr' },
  { url:'https://www.premiere.fr/feed',                       src:'Première',        country:'FR', cat:'entertainment', lang:'fr' },

  // ── Germany — einflussreichste Quellen ──
  { url:'https://www.tagesschau.de/xml/rss2/',                src:'Tagesschau',      country:'DE', cat:'world',         lang:'de' },
  { url:'https://www.spiegel.de/schlagzeilen/index.rss',      src:'Der Spiegel',     country:'DE', cat:'world',         lang:'de' },
  { url:'https://www.welt.de/feeds/latest.rss',               src:'Die Welt',        country:'DE', cat:'world',         lang:'de' },
  { url:'https://rss.focus.de/fol/XML/rss_folnews.xml',       src:'Focus Online',    country:'DE', cat:'world',         lang:'de' },
  { url:'https://www.kicker.de/news/fussball/bundesliga/spieltag/1-bundesliga.rss', src:'Kicker', country:'DE', cat:'sports', lang:'de' },
  { url:'https://www.heise.de/rss/heise.rdf',                 src:'Heise Online',    country:'DE', cat:'technology',    lang:'de' },
  { url:'https://www.gamepro.de/rss/news.rss',                src:'GamePro DE',      country:'DE', cat:'gaming',        lang:'de' },
  { url:'https://www.filmstarts.de/filme/rss.xml',            src:'FilmStarts',      country:'DE', cat:'entertainment', lang:'de' },

  // ── Italy — le fonti più influenti ──
  { url:'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', src:'ANSA',          country:'IT', cat:'world',         lang:'it' },
  { url:'https://www.corriere.it/rss/homepage.xml',            src:'Corriere della Sera', country:'IT', cat:'world',   lang:'it' },
  { url:'https://www.repubblica.it/rss/homepage/rss2.0.xml',  src:'La Repubblica',  country:'IT', cat:'world',         lang:'it' },
  { url:'https://tg24.sky.it/rss.xml',                         src:'Sky TG24',       country:'IT', cat:'world',         lang:'it' },
  { url:'https://www.gazzetta.it/rss/calcio.xml',              src:'La Gazzetta',    country:'IT', cat:'sports',        lang:'it' },
  { url:'https://multiplayer.it/rss/news.rss',                src:'Multiplayer IT',  country:'IT', cat:'gaming',        lang:'it' },
  { url:'https://www.movieplayer.it/rss/news.xml',            src:'MoviePlayer IT',  country:'IT', cat:'entertainment', lang:'it' },

  // ── Portugal — as fontes mais influentes ──
  { url:'https://www.publico.pt/api/feeds/rss',               src:'Público',         country:'PT', cat:'world',         lang:'pt' },
  { url:'https://www.cmjornal.pt/rss',                        src:'Correio da Manhã',country:'PT', cat:'world',         lang:'pt' },
  { url:'https://www.jn.pt/rss/',                             src:'Jornal de Notícias', country:'PT', cat:'world',      lang:'pt' },
  { url:'https://observador.pt/feed/',                        src:'Observador',      country:'PT', cat:'world',         lang:'pt' },
  { url:'https://www.record.pt/rss',                          src:'Record PT',       country:'PT', cat:'sports',        lang:'pt' },

  // ── Netherlands — meest invloedrijke bronnen ──
  { url:'https://feeds.nos.nl/nosnieuwsalgemeen',             src:'NOS Nieuws',      country:'NL', cat:'world',         lang:'nl' },
  { url:'https://www.nu.nl/rss',                              src:'NU.nl',           country:'NL', cat:'world',         lang:'nl' },
  { url:'https://www.telegraaf.nl/feed',                      src:'De Telegraaf',    country:'NL', cat:'world',         lang:'nl' },
  { url:'https://feeds.nos.nl/nossportalgemeen',              src:'NOS Sport',       country:'NL', cat:'sports',        lang:'nl' },

  // ── Poland — najbardziej wpływowe źródła ──
  { url:'https://www.tvn24.pl/najnowsze.xml',                 src:'TVN24',           country:'PL', cat:'world',         lang:'pl' },
  { url:'https://sport.tvn24.pl/najnowsze.xml',               src:'TVN Sport',       country:'PL', cat:'sports',        lang:'pl' },

  // ── Scandinavia ──
  { url:'https://www.nrk.no/nyheter/rss.xml',                 src:'NRK',             country:'NO', cat:'world',         lang:'no' },
  { url:'https://rss.dr.dk/nyheder/',                         src:'DR Danmark',      country:'DK', cat:'world',         lang:'da' },
  { url:'https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/', src:'Aftonbladet', country:'SE', cat:'world', lang:'sv' },
  { url:'https://feeds.expressen.se/nyheter/',                src:'Expressen',       country:'SE', cat:'world',         lang:'sv' },
  { url:'https://yle.fi/uutiset/rss/uutiset.rss',             src:'Yle Finland',     country:'FI', cat:'world',         lang:'fi' },

  // ── Switzerland / Austria / Belgium ──
  { url:'https://www.srf.ch/news/rss',                        src:'SRF News',        country:'CH', cat:'world',         lang:'de' },
  { url:'https://orf.at/stories/rss/',                        src:'ORF',             country:'AT', cat:'world',         lang:'de' },
  { url:'https://www.rtbf.be/api/partner/json/list?partner=rss&cat=22', src:'RTBF', country:'BE', cat:'world',         lang:'fr' },

  // ── Russia & Ukraine ──
  { url:'https://www.themoscowtimes.com/rss/news',            src:'Moscow Times',    country:'RU', cat:'world',         lang:'en' },
  { url:'https://kyivindependent.com/feed/',                  src:'Kyiv Independent',country:'UA', cat:'world',         lang:'en' },

  // ── Middle East ──
  { url:'https://www.haaretz.com/cmlink/1.4',                 src:'Haaretz',         country:'IL', cat:'world',         lang:'en' },
  { url:'https://www.jpost.com/rss/rssfeedsfrontpage.aspx',   src:'Jerusalem Post',  country:'IL', cat:'world',         lang:'en' },
  { url:'https://www.arabnews.com/rss.xml',                   src:'Arab News',       country:'SA', cat:'world',         lang:'en' },
  { url:'https://www.almasryalyoum.com/rss.xml',              src:'Al-Masry Al-Youm',country:'EG', cat:'world',         lang:'ar' },
  { url:'https://gulfnews.com/rss',                           src:'Gulf News',       country:'AE', cat:'world',         lang:'en' },
  { url:'https://www.hurriyetdailynews.com/rss.aspx',         src:'Hürriyet Daily News', country:'TR', cat:'world',    lang:'en' },
  { url:'https://www.dailysabah.com/rss',                     src:'Daily Sabah',     country:'TR', cat:'world',         lang:'en' },

  // ── Africa ──
  { url:'https://www.news24.com/news24/rss',                  src:'News24',          country:'ZA', cat:'world',         lang:'en' },
  { url:'https://punchng.com/feed/',                          src:'Punch NG',        country:'NG', cat:'world',         lang:'en' },
  { url:'https://nation.africa/rss',                          src:'Nation Africa',   country:'KE', cat:'world',         lang:'en' },
  { url:'https://myjoyonline.com/feed/',                      src:'Joy Online',      country:'GH', cat:'world',         lang:'en' },
  { url:'https://www.egyptindependent.com/feed/',             src:'Egypt Independent',country:'EG',cat:'world',         lang:'en' },

  // ── India — most influential English sources ──
  { url:'https://www.thehindu.com/feeder/default.rss',        src:'The Hindu',       country:'IN', cat:'world',         lang:'en' },
  { url:'https://www.ndtv.com/rss/latest',                    src:'NDTV',            country:'IN', cat:'world',         lang:'en' },
  { url:'https://www.hindustantimes.com/feeds/rss/topnews/rssfeed.xml', src:'Hindustan Times', country:'IN', cat:'world', lang:'en' },
  { url:'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', src:'ESPNCricinfo', country:'IN', cat:'sports',   lang:'en' },

  // ── Asia-Pacific ──
  { url:'https://www.japantimes.co.jp/feed/',                 src:'Japan Times',     country:'JP', cat:'world',         lang:'en' },
  { url:'https://asia.nikkei.com/rss/feed/nar',               src:'Nikkei Asia',     country:'JP', cat:'world',         lang:'en' },
  { url:'https://www.koreaherald.com/common/rss.php',         src:'Korea Herald',    country:'KR', cat:'world',         lang:'en' },
  { url:'https://www.scmp.com/rss/2/feed',                    src:'South China Morning Post', country:'CN', cat:'world', lang:'en' },
  { url:'https://www.straitstimes.com/news/rss',              src:'Straits Times',   country:'SG', cat:'world',         lang:'en' },
  { url:'https://www.bangkokpost.com/rss/data/topstories.xml',src:'Bangkok Post',    country:'TH', cat:'world',         lang:'en' },
  { url:'https://e.vnexpress.net/rss/news.rss',               src:'VnExpress EN',    country:'VN', cat:'world',         lang:'en' },
  { url:'https://www.thejakartapost.com/rss',                 src:'Jakarta Post',    country:'ID', cat:'world',         lang:'en' },
  { url:'https://www.philstar.com/rss/headlines',             src:'Philstar',        country:'PH', cat:'world',         lang:'en' },
  { url:'https://www.thestar.com.my/rss/News/Nation',         src:'The Star MY',     country:'MY', cat:'world',         lang:'en' },

  // ── Canada ──
  { url:'https://rss.cbc.ca/lineup/canada.xml',               src:'CBC Canada',      country:'CA', cat:'world',         lang:'en' },
  { url:'https://www.theglobeandmail.com/arc/outboundfeeds/rss/', src:'Globe and Mail', country:'CA', cat:'world',      lang:'en' },
  { url:'https://torontostar.com/rss',                        src:'Toronto Star',    country:'CA', cat:'world',         lang:'en' },

  // ── Australia ──
  { url:'https://www.abc.net.au/news/feed/51120/rss.xml',     src:'ABC Australia',   country:'AU', cat:'world',         lang:'en' },
  { url:'https://www.abc.net.au/news/feed/1534/rss.xml',      src:'ABC Sport AU',    country:'AU', cat:'sports',        lang:'en' },
  { url:'https://www.smh.com.au/rss/feed.xml',                src:'Sydney Morning Herald', country:'AU', cat:'world',   lang:'en' },

  // ── Mexico ──
  { url:'https://www.eluniversal.com.mx/rss.xml',             src:'El Universal MX', country:'MX', cat:'world',         lang:'es' },
  { url:'https://www.milenio.com/rss',                        src:'Milenio',         country:'MX', cat:'world',         lang:'es' },
  { url:'https://www.mediotiempo.com/rss',                    src:'Medio Tiempo',    country:'MX', cat:'sports',        lang:'es' },

  // ── Argentina ──
  { url:'https://www.infobae.com/feeds/rss/',                 src:'Infobae',         country:'AR', cat:'world',         lang:'es' },
  { url:'https://www.clarin.com/rss/ultimas_noticias.xml',    src:'Clarín',          country:'AR', cat:'world',         lang:'es' },
  { url:'https://www.ole.com.ar/rss/',                        src:'Olé',             country:'AR', cat:'sports',        lang:'es' },

  // ── Colombia / Chile / Perú ──
  { url:'https://www.eltiempo.com/rss/noticias_top.xml',      src:'El Tiempo CO',    country:'CO', cat:'world',         lang:'es' },
  { url:'https://www.latercera.com/feed/',                    src:'La Tercera CL',   country:'CL', cat:'world',         lang:'es' },
  { url:'https://elcomercio.pe/rss/',                         src:'El Comercio PE',  country:'PE', cat:'world',         lang:'es' },

  // ── Brazil ──
  { url:'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', src:'Folha de S.Paulo', country:'BR', cat:'world',   lang:'pt' },
  { url:'https://g1.globo.com/rss/g1/',                       src:'G1 Globo',        country:'BR', cat:'world',         lang:'pt' },
  { url:'https://www.uol.com.br/rss.xml',                     src:'UOL',             country:'BR', cat:'world',         lang:'pt' },
  { url:'https://www.lance.com.br/feed',                      src:'Lance',           country:'BR', cat:'sports',        lang:'pt' },
  { url:'https://ge.globo.com/rss/ge.xml',                    src:'GE Globo',        country:'BR', cat:'sports',        lang:'pt' },
];
