/**
 * ORBIT — Version & Changelog
 * Beta: versiones 0.x.x
 * Bump VERSION on every meaningful deploy.
 */

export const VERSION = '0.4.3';

export const CHANGELOG = [
  {
    version: '0.4.3',
    date:    '2026-05-25',
    emoji:   '🔐',
    title:   'Seguridad + Idioma de Email',
    items: [
      'Selector de idioma de email en registro y perfil (ES/EN/FR/DE)',
      'Headers de seguridad: HSTS, X-Frame-Options, nosniff',
      'Rate limiting en endpoints de login/registro',
      'Endpoints de admin protegidos con clave secreta',
      'Whitelist de campos en actualizaciones de perfil',
    ],
  },
  {
    version: '0.4.2',
    date:    '2026-05-22',
    emoji:   '🔭',
    title:   'Globe HD + Shader mejorado',
    items: [
      'Textura fotorrealista NASA Blue Marble (three-globe v2.31)',
      'Shader con unsharp mask + saturación controlada',
      'Renderer al pixel ratio nativo del dispositivo (sin cap)',
      'Geometría de la esfera 192×192 vértices',
      'Badges de país visibles en todas las plataformas',
    ],
  },
  {
    version: '0.4.0',
    date:    '2026-05-21',
    emoji:   '⚡',
    title:   'ORBIT+ · Chronos · Audio Brief',
    items: [
      'Página ORBIT+ con planes y lista de espera',
      'Chronos Engine: globo aterriza en tu zona horaria',
      'Audio Brief con Web Speech API (sin coste)',
      'Controles glassmorphism cinematográfico',
      'Reloj mundial terminal Bloomberg',
    ],
  },
  {
    version: '0.3.0',
    date:    '2026-05-20',
    emoji:   '🌍',
    title:   'Noticias en tiempo real',
    items: [
      'SSE streaming desde Railway (cada 90s)',
      'Pulse Engine: tendencias reales desde 80+ fuentes RSS',
      'Triple dedup semántico (URL + título + cosine similarity)',
      'Panel de país con hub de categorías',
    ],
  },
];

const SEEN_KEY = 'orbit_seen_version';

export function shouldShowChangelog() {
  return localStorage.getItem(SEEN_KEY) !== VERSION;
}

export function markChangelogSeen() {
  localStorage.setItem(SEEN_KEY, VERSION);
}
