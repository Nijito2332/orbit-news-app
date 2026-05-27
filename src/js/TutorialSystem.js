// ────────────────────────────────────────────────────────────────────
//  ORBIT Tutorial System — cinematic onboarding for first-time users
// ────────────────────────────────────────────────────────────────────

const KEY = 'orbit_tutorial_v2';

// Each step: what to show, where to put the panel, what to spotlight
const STEPS = [
  {
    id:       'welcome',
    badge:    null,
    icon:     null,
    title:    'El futuro de las noticias',
    desc:     'Bienvenido a ORBIT — un planeta Tierra 3D en tiempo real con miles de historias en vivo.',
    hint:     null,
    cta:      'Empezar',
    pos:      'center',
    spot:     'dark',
    final:    false,
  },
  {
    id:       'globe',
    badge:    '01',
    icon:     '🌍',
    title:    'Gira la Tierra',
    desc:     'Arrastra para rotar el globo. Pellizca para hacer zoom. El planeta entero es tu mapa de noticias.',
    hint:     'Prueba a girar el globo ahora mismo',
    cta:      'Siguiente',
    pos:      'bottom',
    spot:     'globe',
    final:    false,
  },
  {
    id:       'hotspot',
    badge:    '02',
    icon:     '📍',
    title:    'Los hotspots son noticias en vivo',
    desc:     'Cada punto brillante en el globo representa un país con historias activas. Su color indica la categoría dominante.',
    hint:     'Toca cualquier punto para explorar el país',
    cta:      'Siguiente',
    pos:      'bottom',
    spot:     'globe',
    final:    false,
  },
  {
    id:       'categories',
    badge:    '03',
    icon:     '🎯',
    title:    'Filtra por categoría',
    desc:     'Elige Deportes ⚽, Gaming 🎮, Tecnología 💻 o Entretenimiento 🎬. El globo cambia de color al instante.',
    hint:     null,
    cta:      'Siguiente',
    pos:      'sidebar',
    spot:     'sidebar',
    final:    false,
  },
  {
    id:       'translate',
    badge:    '04',
    icon:     '🌐',
    title:    'El mundo en tu idioma',
    desc:     'ORBIT traduce automáticamente noticias de 130+ fuentes globales. Español, English, Français o Deutsch.',
    hint:     'Cambia el idioma en el menú superior derecho',
    cta:      'Siguiente',
    pos:      'bottom',
    spot:     'lang',
    final:    false,
  },
  {
    id:       'ready',
    badge:    null,
    icon:     null,
    title:    'El mundo te espera',
    desc:     'Explora el pulso de la humanidad en tiempo real. Cada historia, cada país, en la palma de tu mano.',
    hint:     null,
    cta:      'Explorar ORBIT',
    pos:      'center',
    spot:     'dark',
    final:    true,
  },
];

// Resting transform for each panel position (used as animation base)
const REST = {
  center:  'translate(-50%, -50%)',
  bottom:  'translateX(-50%)',
  sidebar: 'translateY(-50%)',
};
const ENTER_EXTRA = {
  center:  'scale(0.93)',
  bottom:  'translateY(20px)',
  sidebar: 'translateX(-14px)',
};
const EXIT_EXTRA = {
  center:  'scale(1.04)',
  bottom:  'translateY(-10px)',
  sidebar: 'translateX(10px)',
};

export class TutorialSystem {
  constructor(globe) {
    this._globe  = globe;
    this._step   = 0;
    this._el     = null;
    this._active = false;
  }

  hasCompleted() { return !!localStorage.getItem(KEY); }
  markCompleted() { localStorage.setItem(KEY, '1'); }
  reset() { localStorage.removeItem(KEY); }

  start(force = false) {
    if (this._active) return;
    if (this.hasCompleted() && !force) return;
    this._build();
    this._go(0);
  }

  reopen() {
    if (this._el) { this._done(false); }
    setTimeout(() => { this._build(); this._go(0); }, 300);
  }

  // ── DOM construction ──────────────────────────────────────────────────────────
  _build() {
    this._el?.remove();
    const el = document.createElement('div');
    el.id = 'obt';
    el.className = 'obt';
    el.innerHTML = `
      <div class="obt-veil" id="obt-veil"></div>
      <div class="obt-panel" id="obt-panel">
        <button class="obt-x" id="obt-x" title="Saltar tutorial" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        <div class="obt-top" id="obt-top">
          <span class="obt-badge" id="obt-badge"></span>
        </div>

        <div class="obt-icon" id="obt-icon"></div>
        <h2  class="obt-title" id="obt-title"></h2>
        <p   class="obt-desc"  id="obt-desc"></p>

        <div class="obt-hint" id="obt-hint">
          <span class="obt-hint-ico">💡</span>
          <span class="obt-hint-txt" id="obt-hint-txt"></span>
        </div>

        <div class="obt-footer">
          <div class="obt-dots" id="obt-dots">
            ${STEPS.map((_, i) => `<span class="obt-dot"></span>`).join('')}
          </div>
          <button class="obt-cta" id="obt-cta"></button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this._el    = el;
    this._active = true;

    el.querySelector('#obt-x').addEventListener('click',  () => this._done(true));
    el.querySelector('#obt-cta').addEventListener('click', () => this._next());
  }

  // ── Step renderer ─────────────────────────────────────────────────────────────
  _go(idx) {
    const s = STEPS[idx];
    if (!s) { this._done(true); return; }

    const panel = this._el.querySelector('#obt-panel');
    const badge = this._el.querySelector('#obt-badge');
    const top   = this._el.querySelector('#obt-top');
    const icon  = this._el.querySelector('#obt-icon');
    const title = this._el.querySelector('#obt-title');
    const desc  = this._el.querySelector('#obt-desc');
    const hint  = this._el.querySelector('#obt-hint');
    const htxt  = this._el.querySelector('#obt-hint-txt');
    const cta   = this._el.querySelector('#obt-cta');
    const dots  = this._el.querySelectorAll('.obt-dot');
    const veil  = this._el.querySelector('#obt-veil');

    // Content
    top.style.display   = s.badge ? 'flex' : 'none';
    badge.textContent   = s.badge || '';
    icon.textContent    = s.icon || '';
    icon.style.display  = s.icon ? 'block' : 'none';
    title.textContent   = s.title;
    desc.textContent    = s.desc;
    htxt.textContent    = s.hint || '';
    hint.style.display  = s.hint ? 'flex' : 'none';
    cta.textContent     = s.cta;
    cta.className       = `obt-cta${s.final ? ' obt-cta-launch' : ''}`;

    // Progress dots
    dots.forEach((d, i) => d.classList.toggle('obt-dot-on', i === idx));

    // Panel position class
    panel.className = `obt-panel obt-panel-${s.pos}`;

    // Spotlight veil
    this._spotlight(veil, s.spot);

    // Contextual glows on app elements
    document.querySelector('.sidebar')?.classList.toggle('obt-glow', s.id === 'categories');
    document.getElementById('btn-lang')?.classList.toggle('obt-glow-btn', s.id === 'translate');

    // Entry animation
    const base  = REST[s.pos];
    const enter = `${base} ${ENTER_EXTRA[s.pos]}`;
    panel.style.opacity   = '0';
    panel.style.transform = enter;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.transition = 'opacity 0.48s ease, transform 0.48s cubic-bezier(0.34,1.56,0.64,1)';
        panel.style.opacity    = '1';
        panel.style.transform  = base;
      });
    });

    this._step = idx;
  }

  // ── Spotlight ─────────────────────────────────────────────────────────────────
  _spotlight(veil, type) {
    const ease = 'background 0.55s ease';
    veil.style.transition = ease;

    if (!type || type === 'dark') {
      veil.style.background = 'rgba(0,0,0,0.42)';
      return;
    }

    if (type === 'globe') {
      const r  = Math.min(window.innerWidth, window.innerHeight) * 0.44;
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      veil.style.background =
        `radial-gradient(circle ${r}px at ${cx}px ${cy}px, transparent 0%, rgba(0,0,0,0.60) 100%)`;
      return;
    }

    if (type === 'sidebar') {
      const sb = document.querySelector('.sidebar');
      if (!sb) { veil.style.background = 'rgba(0,0,0,0.42)'; return; }
      const rc = sb.getBoundingClientRect();
      const cx = rc.left + rc.width  / 2;
      const cy = rc.top  + rc.height / 2;
      const r  = Math.max(rc.width, rc.height) * 0.9;
      veil.style.background =
        `radial-gradient(ellipse ${r * 1.2}px ${r}px at ${cx}px ${cy}px, transparent 0%, rgba(0,0,0,0.65) 100%)`;
      return;
    }

    if (type === 'lang') {
      const btn = document.getElementById('btn-lang');
      if (!btn) { veil.style.background = 'rgba(0,0,0,0.42)'; return; }
      const rc  = btn.getBoundingClientRect();
      const cx  = rc.left + rc.width  / 2;
      const cy  = rc.top  + rc.height / 2;
      veil.style.background =
        `radial-gradient(circle 90px at ${cx}px ${cy}px, transparent 0%, rgba(0,0,0,0.68) 100%)`;
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  _next() {
    const panel = this._el?.querySelector('#obt-panel');
    if (!panel) return;
    const s    = STEPS[this._step];
    const base = REST[s?.pos || 'center'];
    const exit = `${base} ${EXIT_EXTRA[s?.pos || 'center']}`;

    panel.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    panel.style.opacity    = '0';
    panel.style.transform  = exit;

    setTimeout(() => {
      if (this._step + 1 >= STEPS.length) this._done(true);
      else this._go(this._step + 1);
    }, 220);
  }

  _done(persist = true) {
    this._active = false;
    if (persist) this.markCompleted();

    // Remove contextual glows
    document.querySelector('.sidebar')?.classList.remove('obt-glow');
    document.getElementById('btn-lang')?.classList.remove('obt-glow-btn');

    const el = this._el;
    if (!el) return;
    el.style.transition = 'opacity 0.5s ease';
    el.style.opacity    = '0';
    setTimeout(() => { el.remove(); this._el = null; }, 520);
  }
}
