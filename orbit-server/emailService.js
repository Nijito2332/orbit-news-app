// ════════════════════════════════════════════════════════
//  ORBIT — Email Service v2 (Resend.com)
//  Premium Daily Brief — enviado a las 20:00 hora local
// ════════════════════════════════════════════════════════

const RESEND_KEY = process.env.RESEND_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'ORBIT News <onboarding@resend.dev>';
const APP_URL    = process.env.APP_URL    || 'https://orbit-news.vercel.app';

// ── i18n strings ─────────────────────────────────────────────────────────────
const L = {
  en: { greeting: n => `Good evening, ${n}`, sub: 'Your world intelligence brief for today.', cta: 'Explore the Globe', read: 'Read full story', footer: 'You receive this because you subscribed to ORBIT Daily Brief.', unsub: 'Unsubscribe', top: 'TOP STORY', stories: 'stories' },
  es: { greeting: n => `Buenas tardes, ${n}`, sub: 'Tu resumen de inteligencia global de hoy.', cta: 'Explorar el Globo', read: 'Leer artículo completo', footer: 'Recibes esto porque te suscribiste al Resumen Diario de ORBIT.', unsub: 'Cancelar suscripción', top: 'DESTACADO', stories: 'noticias' },
  fr: { greeting: n => `Bonsoir, ${n}`, sub: "Votre résumé d'intelligence mondiale pour aujourd'hui.", cta: 'Explorer le Globe', read: "Lire l'article", footer: "Vous recevez ceci car vous êtes abonné au Brief Quotidien d'ORBIT.", unsub: 'Se désabonner', top: 'À LA UNE', stories: 'articles' },
  de: { greeting: n => `Guten Abend, ${n}`, sub: 'Ihr globaler Intelligenz-Brief für heute.', cta: 'Den Globus erkunden', read: 'Vollständigen Artikel lesen', footer: 'Sie erhalten dies, weil Sie den ORBIT Tagesbericht abonniert haben.', unsub: 'Abmelden', top: 'TOP MELDUNG', stories: 'Meldungen' },
};

// ── Category accent colors ────────────────────────────────────────────────────
const CAT_META = {
  world:         { icon: '🌍', color: '#00D4FF', bg: 'rgba(0,212,255,0.08)',   label: { en:'World',         es:'Mundo',           fr:'Monde',        de:'Welt'          } },
  sports:        { icon: '⚽', color: '#86EFAC', bg: 'rgba(134,239,172,0.08)', label: { en:'Sports',        es:'Deportes',        fr:'Sports',       de:'Sport'         } },
  technology:    { icon: '💻', color: '#C084FC', bg: 'rgba(192,132,252,0.08)', label: { en:'Technology',    es:'Tecnología',      fr:'Technologie',  de:'Technologie'   } },
  entertainment: { icon: '🎬', color: '#818CF8', bg: 'rgba(129,140,248,0.08)', label: { en:'Entertainment', es:'Entretenimiento', fr:'Divertissement',de:'Unterhaltung'  } },
  gaming:        { icon: '🎮', color: '#2DD4BF', bg: 'rgba(45,212,191,0.08)',  label: { en:'Gaming',        es:'Gaming',          fr:'Gaming',       de:'Gaming'        } },
  trending:      { icon: '🔥', color: '#67E8F9', bg: 'rgba(103,232,249,0.08)', label: { en:'Trending',      es:'Tendencias',      fr:'Tendances',    de:'Trending'      } },
};

// ── Build HTML ────────────────────────────────────────────────────────────────
function buildEmailHTML({ userName, dateStr, sections, lang = 'es' }) {
  const lbl  = L[lang] || L.es;

  // ── One section per category ──────────────────────────────────────────────
  const sectionsHTML = sections.map(sec => {
    const meta    = CAT_META[sec.cat] || CAT_META.world;
    const catName = meta.label[lang] || meta.label.en;
    const color   = meta.color;
    const bg      = meta.bg;

    // Deduplicate stories by title fingerprint
    const seen = new Set();
    const unique = sec.stories.filter(s => {
      if (!s.title) return false;
      const fp = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    }).slice(0, 3);

    const articlesHTML = unique.map((s, i) => {
      const isTop  = i === 0;
      const title  = (s.title  || '').replace(/[<>]/g, '');
      const source = s.source || 'ORBIT';
      const summary = s.summary ? s.summary.replace(/[<>]/g, '').slice(0, 160) + '…' : '';
      const readLink = s.url ? `<a href="${s.url}" style="display:inline-block;margin-top:10px;font-size:12px;font-weight:700;color:${color};text-decoration:none;letter-spacing:.03em;border-bottom:1px solid ${color}44;padding-bottom:1px">${lbl.read} →</a>` : '';

      return `
        <tr>
          <td style="padding:${i > 0 ? '20px' : '0'} 0 0; ${i > 0 ? `border-top:1px solid rgba(255,255,255,0.06);` : ''}">
            ${isTop ? `<div style="display:inline-block;margin-bottom:10px;padding:3px 10px;background:${color}22;border:1px solid ${color}55;border-radius:4px;font-size:9px;font-weight:800;letter-spacing:.14em;color:${color}">★ ${lbl.top}</div>` : ''}
            <div style="font-size:${isTop ? '17' : '15'}px;font-weight:700;color:#ffffff;line-height:1.45;margin-bottom:6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">${title}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:${summary ? '8' : '0'}px">
              <span style="font-size:10px;font-weight:600;color:${color};background:${color}18;padding:2px 8px;border-radius:4px;letter-spacing:.04em">${source}</span>
            </div>
            ${summary ? `<div style="font-size:13px;color:rgba(255,255,255,0.52);line-height:1.7">${summary}</div>` : ''}
            ${readLink}
          </td>
        </tr>`;
    }).join('');

    return `
    <!-- ${catName} section -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
      <!-- Category header -->
      <tr>
        <td style="background:${bg};padding:14px 22px;border-bottom:1px solid rgba(255,255,255,0.07)">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:16px;vertical-align:middle">${meta.icon}</span>
                <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.16em;color:${color};text-transform:uppercase;vertical-align:middle;margin-left:8px">${catName}</span>
              </td>
              <td align="right">
                <span style="font-size:10px;color:rgba(255,255,255,0.28)">${unique.length} ${lbl.stories}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Articles -->
      <tr>
        <td style="background:rgba(255,255,255,0.02);padding:20px 22px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${articlesHTML}
          </table>
        </td>
      </tr>
    </table>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>ORBIT Daily Brief</title>
</head>
<body style="margin:0;padding:0;background-color:#09090F;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090F">
<tr><td align="center" style="padding:40px 16px 60px">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">

  <!-- ═══ HERO ═══ -->
  <tr><td style="padding-bottom:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px;overflow:hidden;background:linear-gradient(145deg,#0D0D20 0%,#111128 50%,#0A0A1C 100%);border:1px solid rgba(0,212,255,0.18)">
      <!-- Top accent line -->
      <tr><td style="height:3px;background:linear-gradient(90deg,#7B2FBE,#00D4FF,#7B2FBE)"></td></tr>
      <tr>
        <td style="padding:44px 40px 36px;text-align:center">
          <!-- Logo -->
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.35em;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:16px">◎ &nbsp; O R B I T</div>
          <!-- Date pill -->
          <div style="display:inline-block;padding:5px 18px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);border-radius:99px;font-size:11px;font-weight:600;color:rgba(0,212,255,0.8);letter-spacing:.08em;margin-bottom:28px">${dateStr}</div>
          <!-- Greeting -->
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#ffffff;line-height:1.2;margin-bottom:12px;letter-spacing:-.01em">${lbl.greeting(userName)}</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;max-width:360px;margin:0 auto">${lbl.sub}</div>
        </td>
      </tr>
      <!-- Separator stars decoration -->
      <tr>
        <td style="padding:0 40px 32px;text-align:center">
          <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,rgba(0,212,255,0.5),transparent);margin:0 auto"></div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ═══ SECTIONS ═══ -->
  <tr><td style="padding-bottom:4px">
    ${sectionsHTML}
  </td></tr>

  <!-- ═══ CTA ═══ -->
  <tr><td style="padding:20px 0 40px;text-align:center">
    <table cellpadding="0" cellspacing="0" style="display:inline-table">
      <tr>
        <td style="border-radius:14px;background:linear-gradient(135deg,#00D4FF 0%,#7B2FBE 100%);padding:1px">
          <a href="${APP_URL}" style="display:block;padding:16px 48px;background:transparent;border-radius:13px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:.03em;white-space:nowrap">${lbl.cta} &rarr;</a>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="border-top:1px solid rgba(255,255,255,0.07);padding:28px 0 0;text-align:center">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.28em;color:rgba(255,255,255,0.25);margin-bottom:10px">◎ ORBIT</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.2);line-height:1.8">
        ${lbl.footer}<br>
        <a href="${APP_URL}" style="color:rgba(0,212,255,0.35);text-decoration:none">${lbl.unsub}</a>
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────
export async function sendDailyBrief({ user, sections }) {
  const r = await sendDailyBriefDebug({ user, sections });
  return r.ok;
}

export async function sendDailyBriefDebug({ user, sections }) {
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_KEY not set' };
  if (!user.email)  return { ok: false, error: 'no email' };
  if (!sections.length) return { ok: false, error: 'no sections' };

  const lang    = user.email_language || user.language || 'es';
  const name    = user.name || user.email.split('@')[0];
  const dateStr = new Date().toLocaleDateString(lang, { weekday:'long', day:'numeric', month:'long' });
  const html    = buildEmailHTML({ userName: name, dateStr, sections, lang });

  const subjects = {
    en: `◎ ORBIT Daily Brief — ${new Date().toLocaleDateString('en', { month:'short', day:'numeric' })}`,
    es: `◎ ORBIT Resumen Diario — ${new Date().toLocaleDateString('es', { month:'short', day:'numeric' })}`,
    fr: `◎ ORBIT Brief du Jour — ${new Date().toLocaleDateString('fr', { month:'short', day:'numeric' })}`,
    de: `◎ ORBIT Tagesbericht — ${new Date().toLocaleDateString('de', { month:'short', day:'numeric' })}`,
  };

  try {
    const res  = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: subjects[lang] || subjects.es, html }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error('[Email] Resend error:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    console.log(`[Email] Sent to ${user.email}`);
    return { ok: true };
  } catch(e) {
    console.error('[Email] Error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Build sections — language-aware, deduped ──────────────────────────────────
export function buildUserSections(allNews, userFavorites, lang = 'es') {
  const favorites = userFavorites?.length ? userFavorites : ['world','technology','sports'];
  const others    = Object.keys(CAT_META).filter(c => !favorites.includes(c));

  // Language priority: prefer articles in user's language, then English, then any
  const langPriority = (article) => {
    if (article.lang === lang)  return 0;   // exact match
    if (article.lang === 'en')  return 1;   // english fallback
    return 2;                                // any other language
  };

  return [...favorites, ...others].slice(0, 5).map(cat => {
    const seen    = new Set();
    const stories = allNews
      .filter(n => {
        if (n.category !== cat || n.isMicro || !n.title || n.title.length < 15) return false;
        const fp = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      })
      .sort((a, b) => {
        // Primary sort: language preference; secondary: trend score
        const lp = langPriority(a) - langPriority(b);
        if (lp !== 0) return lp;
        return (b.trendScore || b.intensity || 0) - (a.trendScore || a.intensity || 0);
      })
      .slice(0, 3);
    return { cat, stories };
  }).filter(s => s.stories.length > 0);
}
