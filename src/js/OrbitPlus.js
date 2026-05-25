/**
 * ORBIT+ — Premium subscription page
 * Opens as a fullscreen overlay with pricing, features and CTA.
 * Called from: profile panel, topbar badge, ORBIT+ gates.
 */

const FEATURES = [
  { icon: '✦', label: 'Resumen Diario IA personalizado',   free: true,  plus: true,  plusNote: 'Con IA avanzada' },
  { icon: '📧', label: 'Email 20:00 con tus noticias',      free: true,  plus: true,  plusNote: 'Ilimitado' },
  { icon: '🌍', label: 'Globo 3D en tiempo real',           free: true,  plus: true  },
  { icon: '🔥', label: 'Tendencias en tiempo real',         free: '12',  plus: '50+', plusNote: 'Con velocidad y predicciones' },
  { icon: '🔊', label: 'Audio Brief (voz IA)',               free: false, plus: true  },
  { icon: '⚡', label: 'Alertas de noticias urgentes',       free: false, plus: true  },
  { icon: '📊', label: 'Mercados financieros en el globo',   free: false, plus: true  },
  { icon: '🌐', label: '4 idiomas con traducción IA',        free: '2',   plus: '4'   },
  { icon: '🎨', label: 'Temas exclusivos (Aurora, Solar…)', free: false, plus: true  },
  { icon: '🔍', label: 'Búsqueda avanzada con IA',          free: false, plus: true  },
  { icon: '📱', label: 'App nativa iOS + Android',          free: true,  plus: true,  plusNote: 'Prioridad' },
  { icon: '🤝', label: 'Sin anuncios nunca',                 free: false, plus: true  },
];

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderFeatureVal(val) {
  if (val === true)  return '<span class="oplus-check">✓</span>';
  if (val === false) return '<span class="oplus-no">—</span>';
  return `<span class="oplus-partial">${esc(val)}</span>`;
}

export function openOrbitPlus(trigger = 'manual') {
  const existing = document.getElementById('orbit-plus-page');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'orbit-plus-page';
  overlay.className = 'oplus-overlay';

  overlay.innerHTML = `
    <div class="oplus-inner">
      <button class="oplus-close" id="oplus-close">✕</button>

      <!-- Header -->
      <div class="oplus-header">
        <div class="oplus-logo">◎ ORBIT<span class="oplus-logo-plus">+</span></div>
        <h1 class="oplus-title">Eleva tu inteligencia global</h1>
        <p class="oplus-subtitle">Todo lo que ocurre en el planeta, con IA que trabaja para ti 24/7.</p>
      </div>

      <!-- Pricing cards -->
      <div class="oplus-plans">

        <!-- Free -->
        <div class="oplus-plan">
          <div class="oplus-plan-name">Free</div>
          <div class="oplus-plan-price">
            <span class="oplus-price-num">0€</span>
            <span class="oplus-price-period">/mes</span>
          </div>
          <p class="oplus-plan-desc">Empieza a explorar el mundo.</p>
          <div class="oplus-plan-features">
            ${FEATURES.slice(0, 6).map(f => `
              <div class="oplus-feat-row">
                <span class="oplus-feat-icon">${f.icon}</span>
                <span class="oplus-feat-label">${esc(f.label)}</span>
                <span class="oplus-feat-val">${renderFeatureVal(f.free)}</span>
              </div>
            `).join('')}
          </div>
          <button class="oplus-plan-cta oplus-cta-free" disabled>Plan actual</button>
        </div>

        <!-- ORBIT+ -->
        <div class="oplus-plan oplus-plan-featured">
          <div class="oplus-plan-badge">⚡ MÁS POPULAR</div>
          <div class="oplus-plan-name">ORBIT<span style="color:#00D4FF">+</span></div>
          <div class="oplus-plan-price">
            <span class="oplus-price-num">4,99€</span>
            <span class="oplus-price-period">/mes</span>
          </div>
          <p class="oplus-plan-desc">La experiencia completa. Sin límites.</p>
          <div class="oplus-plan-features">
            ${FEATURES.slice(0, 6).map(f => `
              <div class="oplus-feat-row">
                <span class="oplus-feat-icon">${f.icon}</span>
                <span class="oplus-feat-label">${esc(f.label)}${f.plusNote ? `<span class="oplus-feat-note"> · ${esc(f.plusNote)}</span>` : ''}</span>
                <span class="oplus-feat-val">${renderFeatureVal(f.plus)}</span>
              </div>
            `).join('')}
          </div>
          <button class="oplus-plan-cta oplus-cta-plus" id="oplus-cta-monthly">
            Empezar 7 días gratis
          </button>
          <p class="oplus-plan-hint">Cancela cuando quieras · Sin compromiso</p>
        </div>

        <!-- Annual -->
        <div class="oplus-plan oplus-plan-annual">
          <div class="oplus-plan-badge oplus-badge-save">AHORRA 30%</div>
          <div class="oplus-plan-name">ORBIT<span style="color:#00D4FF">+</span> Anual</div>
          <div class="oplus-plan-price">
            <span class="oplus-price-num">3,49€</span>
            <span class="oplus-price-period">/mes</span>
          </div>
          <div class="oplus-price-billed">41,88€ facturado anualmente</div>
          <p class="oplus-plan-desc">El mejor precio. Todo incluido.</p>
          <div class="oplus-plan-features">
            ${FEATURES.slice(0, 6).map(f => `
              <div class="oplus-feat-row">
                <span class="oplus-feat-icon">${f.icon}</span>
                <span class="oplus-feat-label">${esc(f.label)}</span>
                <span class="oplus-feat-val">${renderFeatureVal(f.plus)}</span>
              </div>
            `).join('')}
          </div>
          <button class="oplus-plan-cta oplus-cta-annual" id="oplus-cta-annual">
            Empezar 7 días gratis
          </button>
          <p class="oplus-plan-hint">Mejor valor · Todo de ORBIT+</p>
        </div>
      </div>

      <!-- Full feature comparison -->
      <div class="oplus-compare">
        <h2 class="oplus-compare-title">Comparativa completa</h2>
        <div class="oplus-compare-table">
          <div class="oplus-compare-header">
            <div class="oplus-compare-feature">Funcionalidad</div>
            <div class="oplus-compare-col">Free</div>
            <div class="oplus-compare-col oplus-col-plus">ORBIT+</div>
          </div>
          ${FEATURES.map(f => `
            <div class="oplus-compare-row">
              <div class="oplus-compare-feature">
                <span class="oplus-feat-icon">${f.icon}</span>
                ${esc(f.label)}
              </div>
              <div class="oplus-compare-col">${renderFeatureVal(f.free)}</div>
              <div class="oplus-compare-col oplus-col-plus">
                ${renderFeatureVal(f.plus)}
                ${f.plusNote ? `<div class="oplus-feat-note">${esc(f.plusNote)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- FAQ -->
      <div class="oplus-faq">
        <h2 class="oplus-compare-title">Preguntas frecuentes</h2>
        <div class="oplus-faq-list">
          ${[
            ['¿Cuándo se renueva mi suscripción?', 'Mensual o anualmente según el plan elegido. Te avisamos 3 días antes por email.'],
            ['¿Puedo cancelar en cualquier momento?', 'Sí, sin penalización. Tu acceso continúa hasta el final del período pagado.'],
            ['¿El email de las 20:00 es automático?', 'Completamente. El servidor detecta tu zona horaria y envía el resumen personalizado con las mejores noticias del día.'],
            ['¿Funciona en iOS y Android?', 'Sí. La app nativa para ambas plataformas estará disponible próximamente. Los suscriptores tendrán acceso priority.'],
          ].map(([q, a]) => `
            <div class="oplus-faq-item">
              <div class="oplus-faq-q">${esc(q)}</div>
              <div class="oplus-faq-a">${esc(a)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <p class="oplus-footer-note">Pagos seguros · IVA incluido · Protección de datos GDPR · ORBIT 2026</p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close
  overlay.querySelector('#oplus-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // CTAs — for now show a "coming soon" or redirect to payment form
  const handleCTA = (plan) => {
    overlay.remove();
    // In production: redirect to Stripe checkout or Lemon Squeezy
    // For beta: show a "notify me" form
    showOrbitPlusWaitlist(plan);
  };
  overlay.querySelector('#oplus-cta-monthly')?.addEventListener('click', () => handleCTA('monthly'));
  overlay.querySelector('#oplus-cta-annual')?.addEventListener('click',  () => handleCTA('annual'));
}

function showOrbitPlusWaitlist(plan) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(20px);padding:20px';
  modal.innerHTML = `
    <div style="max-width:420px;width:100%;background:#0D0D1C;border:1px solid rgba(0,212,255,.25);border-radius:20px;padding:36px;text-align:center">
      <div style="font-size:36px;margin-bottom:12px">◎</div>
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin-bottom:10px;color:#fff">ORBIT+ Beta</h2>
      <p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:24px">
        Estamos preparando el sistema de pagos. Déjanos tu email y serás de los primeros en acceder cuando esté listo.
        <br><br>
        <strong style="color:#00D4FF">Plan elegido: ${plan === 'annual' ? 'Anual (3,49€/mes)' : 'Mensual (4,99€/mes)'}</strong>
      </p>
      <input id="wl-email" type="email" placeholder="tu@email.com"
        style="width:100%;padding:13px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;font-size:14px;color:#fff;outline:none;margin-bottom:12px;box-sizing:border-box">
      <button id="wl-submit" style="width:100%;padding:14px;background:linear-gradient(135deg,#00D4FF,#7B2FBE);border:none;border-radius:12px;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-bottom:10px">
        Notificarme cuando esté disponible
      </button>
      <button id="wl-close" style="background:none;border:none;color:rgba(255,255,255,.35);font-size:13px;cursor:pointer;padding:4px">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#wl-close').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#wl-submit').onclick = () => {
    const email = modal.querySelector('#wl-email').value.trim();
    if (!email) return;
    // Save locally + could POST to a waitlist endpoint
    try {
      const list = JSON.parse(localStorage.getItem('orbit_plus_waitlist') || '[]');
      list.push({ email, plan, ts: Date.now() });
      localStorage.setItem('orbit_plus_waitlist', JSON.stringify(list));
    } catch(_) {}
    modal.innerHTML = `
      <div style="max-width:420px;width:100%;background:#0D0D1C;border:1px solid rgba(0,212,255,.25);border-radius:20px;padding:48px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#00FF88;margin-bottom:10px">¡Apuntado!</h2>
        <p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6">Te avisaremos en <strong style="color:#fff">${email}</strong> cuando ORBIT+ esté disponible.</p>
        <button onclick="this.closest('[style]').remove()" style="margin-top:24px;padding:10px 24px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer">Cerrar</button>
      </div>
    `;
  };
}
