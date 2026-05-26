// ════════════════════════════════════════════════════════
//  ORBIT — Realtime Engine (SSE Client)
//  Connects to the backend and receives live story updates.
//  Falls back to polling if SSE is unavailable.
// ════════════════════════════════════════════════════════

// ── Server URL ──────────────────────────────────────────────────────────────
const PRODUCTION_URL = 'https://orbit-news-engine.fly.dev';

const SERVER_URL = (() => {
  // Allow override via localStorage for dev testing
  const custom = localStorage.getItem('orbit_server_url');
  if (custom) return custom;
  // Local dev: use local backend
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  // Everything else (iPhone, iPad, any network) → Railway production
  return PRODUCTION_URL;
})();

export function setServerUrl(url) {
  localStorage.setItem('orbit_server_url', url);
}

export function getServerUrl() { return SERVER_URL; }

// ─── Pulse animation — triggered when countries get new stories ───────────────
function pulseCountries(newStories, globe) {
  if (!globe || !newStories.length) return;
  const updated = new Set(newStories.map(s => s.country));

  // Find hotspots for updated countries and pulse them
  if (globe.hotspots) {
    globe.hotspots.forEach(h => {
      if (updated.has(h.data?.country)) {
        const origOpacity = h.material?.uniforms?.uOpacity?.value || 0.88;
        // Flash bright then return
        if (h.material?.uniforms?.uOpacity) {
          h.material.uniforms.uOpacity.value = 1.0;
          setTimeout(() => {
            if (h.material?.uniforms?.uOpacity) h.material.uniforms.uOpacity.value = origOpacity;
          }, 2000);
        }
      }
    });
  }
}

// ─── ORBIT Realtime Engine ───────────────────────────────────────────────────
export class RealtimeEngine {
  constructor({ onInit, onUpdate, onError, globe } = {}) {
    this.onInit   = onInit;
    this.onUpdate = onUpdate;
    this.onError  = onError;
    this.globe    = globe;
    this._es      = null;
    this._reconnectDelay = 3000;
    this._connected = false;
    this._pollTimer = null;
  }

  start() {
    if (typeof EventSource === 'undefined') {
      console.warn('[Realtime] SSE not available, falling back to polling');
      this._startPolling();
      return;
    }
    this._connectSSE();
  }

  _connectSSE() {
    const url = `${SERVER_URL}/stream`;
    console.log(`[Realtime] Connecting to ${url}`);

    if (this._es) { try { this._es.close(); } catch(_) {} }

    this._es = new EventSource(url);

    this._es.onopen = () => {
      console.log('[Realtime] SSE connected ✓');
      this._connected = true;
      this._reconnectDelay = 3000;
      document.dispatchEvent(new CustomEvent('orbit:connected'));
    };

    this._es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'init') {
          console.log(`[Realtime] Init: ${payload.stories?.length} stories`);
          this.onInit?.(payload.stories || [], payload.stats);
        } else if (payload.type === 'update') {
          const newStories = payload.stories || payload.data || [];
          if (newStories.length > 0) {
            console.log(`[Realtime] Update: ${newStories.length} new stories`);
            this.onUpdate?.(newStories, payload.stats);
            pulseCountries(newStories, this.globe);
            this._showUpdateIndicator(newStories.length);
          }
        }
      } catch(e) {
        console.warn('[Realtime] Parse error:', e.message);
      }
    };

    this._es.onerror = () => {
      this._connected = false;
      this._es?.close();
      console.warn(`[Realtime] SSE error, reconnecting in ${this._reconnectDelay}ms…`);
      this.onError?.();

      // Exponential backoff reconnect
      setTimeout(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 30000);
        this._connectSSE();
      }, this._reconnectDelay);
    };
  }

  // Polling fallback (every 3 minutes)
  _startPolling() {
    const poll = async () => {
      try {
        const res  = await fetch(`${SERVER_URL}/api/stories`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        this.onInit?.(data.stories || [], data.stats);
        console.log(`[Realtime] Polled: ${data.stories?.length} stories`);
      } catch(e) {
        console.warn('[Realtime] Poll failed:', e.message);
        this.onError?.();
      }
    };
    poll();
    this._pollTimer = setInterval(poll, 3 * 60_000);
  }

  stop() {
    this._es?.close();
    clearInterval(this._pollTimer);
    this._connected = false;
  }

  // ── Visual update indicator ───────────────────────────────────────────────
  _showUpdateIndicator(count) {
    const indicator = document.getElementById('live-indicator') || this._createIndicator();
    indicator.textContent = `+${count} new`;
    indicator.style.opacity = '1';
    indicator.style.transform = 'translateY(0)';
    setTimeout(() => {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateY(-8px)';
    }, 4000);
  }

  _createIndicator() {
    const el = document.createElement('div');
    el.id = 'live-indicator';
    el.style.cssText = [
      'position:fixed', 'top:70px', 'right:20px', 'z-index:999',
      'background:linear-gradient(135deg,#00FF88,#00D4FF)',
      'color:#07070F', 'padding:6px 14px', 'border-radius:99px',
      'font-size:12px', 'font-weight:700', 'font-family:Space Grotesk,sans-serif',
      'transition:all 0.4s ease', 'opacity:0', 'transform:translateY(-8px)',
      'pointer-events:none', 'box-shadow:0 4px 16px rgba(0,255,136,0.4)',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  isConnected() { return this._connected; }
  getServerUrl() { return SERVER_URL; }
}
