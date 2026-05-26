// ─── ORBIT Icon Generator — pure Node.js, no dependencies ────────────────────
// Generates apple-touch-icon.png (180), icon-192.png, icon-512.png
// Run: node scripts/generate-icons.mjs

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');

// ── CRC32 for PNG chunks ──────────────────────────────────────────────────────
const crcTable = (() => {
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
  for (const b of buf) c = (c >>> 8) ^ crcTable[(c ^ b) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

// ── Icon renderer ─────────────────────────────────────────────────────────────
// Design: dark #07070F bg + outer cyan ring + inner purple ring + center dot
// (the ◎ ORBIT bullseye mark, works at all sizes)
function renderIcon(size) {
  const cx = size / 2, cy = size / 2;
  const r  = size / 2;

  // Ring radii (relative to half-size)
  const outerRingOuter = r * 0.47;
  const outerRingInner = r * 0.31;
  const innerRingOuter = r * 0.20;
  const innerRingInner = r * 0.09;
  const centerDot      = r * 0.05;

  // Brand colors
  const bg     = [7,  7,  16];
  const cyan   = [0,  212, 255];
  const purple = [123, 47, 190];
  const white  = [220, 240, 255];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpRGB(a, b, t) { return a.map((v, i) => Math.round(lerp(v, b[i], t))); }

  // Coverage with smooth anti-aliasing (1.5px feather)
  function ringCoverage(d, inner, outer) {
    const feather = 1.5;
    if (d > outer + feather || d < inner - feather) return 0;
    const outerFade = d > outer - feather ? 1 - (d - (outer - feather)) / (feather * 2) : 1;
    const innerFade = d < inner + feather ? 1 - ((inner + feather) - d) / (feather * 2) : 1;
    return Math.max(0, Math.min(1, outerFade * innerFade));
  }
  function dotCoverage(d, radius) {
    const feather = 1.5;
    return Math.max(0, Math.min(1, 1 - (d - (radius - feather)) / (feather * 2)));
  }

  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // PNG filter byte = None
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d  = Math.sqrt(dx * dx + dy * dy);

      // Start with background
      let pixel = [...bg];

      // Outer cyan ring
      const outerC = ringCoverage(d, outerRingInner, outerRingOuter);
      if (outerC > 0) pixel = lerpRGB(pixel, cyan, outerC);

      // Inner purple ring
      const innerC = ringCoverage(d, innerRingInner, innerRingOuter);
      if (innerC > 0) pixel = lerpRGB(pixel, purple, innerC);

      // Center white dot
      const dotC = dotCoverage(d, centerDot);
      if (dotC > 0) pixel = lerpRGB(pixel, white, dotC);

      row.push(...pixel);
    }
    scanlines.push(Buffer.from(row));
  }

  const raw  = Buffer.concat(scanlines);
  const idat = deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Generate all sizes ────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });

const icons = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

for (const { size, name } of icons) {
  const png = renderIcon(size);
  writeFileSync(join(OUT, name), png);
  console.log(`✓ public/${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log('\nIcons generated. Run: npm run build && npx cap sync');
