/**
 * AmbientCanvas — Living background particle system
 *
 * A lightweight WebGL-free canvas particle engine.
 * Reacts to:
 *   - news activity level (from TimeContextEngine)
 *   - breaking news events (pulse waves)
 *   - user interaction (mouse proximity)
 *
 * Performance: < 1ms per frame via requestAnimationFrame.
 * @module AmbientCanvas
 */

const MAX_PARTICLES = 80;
// Only ORBIT brand colors — no red, orange or warm tones ever
const COLORS = [
  [0, 212, 255],    // cyan
  [80, 120, 255],   // blue
  [123, 47, 190],   // purple
  [0, 180, 220],    // teal
];

export class AmbientCanvas {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this._particles = [];
    this._activity  = 0.5;   // 0-1 from TimeContextEngine
    this._mouse     = { x: -9999, y: -9999 };
    this._raf       = null;
    this._running   = false;
    this._pulseWaves = [];    // for breaking news flash

    this._resize();
    this._spawn(Math.floor(MAX_PARTICLES * this._activity));
    this._bindEvents();
  }

  // ── Sizing ────────────────────────────────────────────────────────────────
  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._resize(), { passive: true });
    window.addEventListener('mousemove', e => {
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;
    }, { passive: true });
  }

  // ── Particle factory ──────────────────────────────────────────────────────
  _makeParticle() {
    const c = COLORS[Math.floor(Math.random() * 2)]; // cyan or blue only
    return {
      x:    Math.random() * this.canvas.width,
      y:    Math.random() * this.canvas.height,
      vx:   (Math.random() - 0.5) * 0.3,
      vy:   (Math.random() - 0.5) * 0.3,
      r:    0.5 + Math.random() * 1.5,
      alpha: 0.04 + Math.random() * 0.18,
      color: c,
      pulse: Math.random() * Math.PI * 2, // phase offset for twinkle
      life:  1.0,
      decay: 0.0002 + Math.random() * 0.0004,
    };
  }

  _spawn(n) {
    for (let i = 0; i < n; i++) {
      if (this._particles.length < MAX_PARTICLES) {
        this._particles.push(this._makeParticle());
      }
    }
  }

  // ── Activity level — drives particle count & brightness ──────────────────
  setActivity(level) {
    this._activity = Math.max(0, Math.min(1, level));
    // Target count: 20 (quiet night) → 80 (morning burst)
    const target = Math.floor(20 + this._activity * 60);
    if (this._particles.length < target) {
      this._spawn(target - this._particles.length);
    }
  }

  // ── Pulse wave — triggered by breaking news ───────────────────────────────
  pulse(x, y, color = [0, 255, 136]) {
    this._pulseWaves.push({ x, y, r: 0, maxR: Math.max(this.canvas.width, this.canvas.height) * 0.4, color, alpha: 0.25 });
  }

  // ── Breaking news event — spawn bright particles at screen center ─────────
  breakingEvent() {
    // Always blue — no red/orange regardless of sentiment
    const color = COLORS[0]; // cyan only
    this.pulse(this.canvas.width / 2, this.canvas.height / 2, color);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  start() {
    if (this._running) return;
    this._running = true;
    const tick = (ts) => {
      if (!this._running) return;
      this._frame(ts);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _frame(ts) {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    // Fully transparent each frame — no dark overlay on the app
    ctx.clearRect(0, 0, W, H);

    // Draw pulse waves
    this._pulseWaves = this._pulseWaves.filter(pw => {
      pw.r     += 2.5;
      pw.alpha -= 0.004;
      if (pw.alpha <= 0) return false;
      ctx.beginPath();
      ctx.arc(pw.x, pw.y, pw.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${pw.color.join(',')},${pw.alpha.toFixed(3)})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      return true;
    });

    // Draw particles
    this._particles = this._particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;

      // Mouse repulsion
      const dx   = p.x - this._mouse.x;
      const dy   = p.y - this._mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        p.vx += (dx / dist) * 0.06;
        p.vy += (dy / dist) * 0.06;
      }

      p.vx *= 0.995;  // drag
      p.vy *= 0.995;
      p.x  += p.vx;
      p.y  += p.vy;

      // Wrap around edges
      if (p.x < 0)  p.x = W;
      if (p.x > W)  p.x = 0;
      if (p.y < 0)  p.y = H;
      if (p.y > H)  p.y = 0;

      // Twinkle
      const twinkle = 0.6 + 0.4 * Math.sin(ts * 0.001 + p.pulse);
      const alpha   = p.alpha * p.life * twinkle;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha.toFixed(3)})`;
      ctx.fill();

      return true;
    });

    // Respawn dead particles if below target
    const target = Math.floor(20 + this._activity * 60);
    while (this._particles.length < target) {
      this._particles.push(this._makeParticle());
    }
  }
}
