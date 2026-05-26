// ─── ORBIT Icon Generator v2 — neon glow design, pure Node.js ────────────────
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// ── Gaussian glow kernel ──────────────────────────────────────────────────────
function gauss(d, center, sigma) {
  return Math.exp(-((d - center) ** 2) / (2 * sigma * sigma));
}

// ── Render one icon ───────────────────────────────────────────────────────────
function renderIcon(size) {
  const cx = size / 2, cy = size / 2;
  const r  = size / 2;

  // Design radii (relative to r)
  const outerR = r * 0.435;
  const innerR = r * 0.195;

  // Neon glow sigmas — white hot core → colored tube → diffuse halo
  const O_CORE  = r * 0.018;   // outer ring white hot center
  const O_TUBE  = r * 0.038;   // outer ring cyan tube
  const O_HALO  = r * 0.095;   // outer ring diffuse halo
  const I_CORE  = r * 0.014;
  const I_TUBE  = r * 0.030;
  const I_HALO  = r * 0.072;
  const C_DOT   = r * 0.052;   // center glow (disc, center = 0)
  const BG_GLOW = r * 0.62;    // subtle nebula from center

  const scanlines = [];

  for (let y = 0; y < size; y++) {
    const row = [0]; // PNG filter byte = None
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d  = Math.sqrt(dx * dx + dy * dy);

      // ── Start: background (HDR, clamp at end) ──
      let fR = 7, fG = 7, fB = 16;

      // Background: very subtle deep-space radial glow (dark blue center)
      const bg = gauss(d, 0, BG_GLOW);
      fR += bg *  5; fG += bg *  8; fB += bg * 25;

      // ── OUTER RING — Cyan #00D4FF ─────────────────────────────────────────
      // White-hot core
      const oCore = gauss(d, outerR, O_CORE);
      fR += oCore * 255 * 2.8;
      fG += oCore * 255 * 2.8;
      fB += oCore * 255 * 2.8;
      // Cyan tube
      const oTube = gauss(d, outerR, O_TUBE);
      fR += oTube *   0 * 2.4;
      fG += oTube * 212 * 2.4;
      fB += oTube * 255 * 2.4;
      // Cyan halo
      const oHalo = gauss(d, outerR, O_HALO);
      fR += oHalo *   0 * 0.28;
      fG += oHalo * 140 * 0.28;
      fB += oHalo * 200 * 0.28;

      // ── INNER RING — Purple #7B2FBE ───────────────────────────────────────
      const iCore = gauss(d, innerR, I_CORE);
      fR += iCore * 255 * 2.2;
      fG += iCore * 255 * 2.2;
      fB += iCore * 255 * 2.2;
      const iTube = gauss(d, innerR, I_TUBE);
      fR += iTube * 180 * 2.0;
      fG += iTube *  80 * 2.0;
      fB += iTube * 255 * 2.0;
      const iHalo = gauss(d, innerR, I_HALO);
      fR += iHalo * 100 * 0.25;
      fG += iHalo *  30 * 0.25;
      fB += iHalo * 180 * 0.25;

      // ── CENTER DOT — Bright cyan-white spark ──────────────────────────────
      const cDot = gauss(d, 0, C_DOT);
      fR += cDot * 200 * 1.8;
      fG += cDot * 235 * 1.8;
      fB += cDot * 255 * 1.8;

      // Clamp HDR → [0, 255]
      row.push(
        Math.min(255, Math.round(fR)),
        Math.min(255, Math.round(fG)),
        Math.min(255, Math.round(fB)),
      );
    }
    scanlines.push(Buffer.from(row));
  }

  const idat = deflateSync(Buffer.concat(scanlines), { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Output ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  const png = renderIcon(size);
  writeFileSync(join(OUT, name), png);
  console.log(`✓ public/${name}  (${size}×${size}, ${(png.length/1024).toFixed(1)} KB)`);
}
console.log('\nDone. Run: npm run build && git add -A && git commit -m "update icons"');
