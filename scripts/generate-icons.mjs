// Generate PWA icons from an SVG source using sharp.
// Run with: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public', 'icons');

const d20Svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#050505"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F5EBD0"/>
      <stop offset="50%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#8B6F1F"/>
    </linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f1f1f"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g transform="translate(256 256)" filter="url(#glow)">
    <polygon points="0,-180 156,-90 156,90 0,180 -156,90 -156,-90" fill="url(#face)" stroke="url(#gold)" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="0,-180 156,-90 0,0 -156,-90" fill="#131313" stroke="url(#gold)" stroke-width="4" stroke-linejoin="round" opacity="0.9"/>
    <polygon points="0,0 156,-90 156,90 0,180" fill="#0d0d0d" stroke="url(#gold)" stroke-width="4" stroke-linejoin="round" opacity="0.7"/>
    <polygon points="0,0 -156,-90 -156,90 0,180" fill="#161616" stroke="url(#gold)" stroke-width="4" stroke-linejoin="round" opacity="0.7"/>
    <text x="0" y="20" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="120" font-weight="700" fill="url(#gold)">20</text>
  </g>
</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <g transform="translate(256 256)">
    <polygon points="0,-130 112,-65 112,65 0,130 -112,65 -112,-65" fill="#0a0a0a" stroke="#D4AF37" stroke-width="5" stroke-linejoin="round"/>
    <text x="0" y="22" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="92" font-weight="700" fill="#D4AF37">20</text>
  </g>
</svg>`;

await mkdir(publicDir, { recursive: true });

await writeFile(resolve(publicDir, 'icon.svg'), d20Svg, 'utf8');

const sizes = [96, 192, 512];
for (const size of sizes) {
  await sharp(Buffer.from(d20Svg))
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, `icon-${size}.png`));
  console.log(`Wrote icon-${size}.png`);
}

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(resolve(publicDir, 'icon-maskable-512.png'));
console.log('Wrote icon-maskable-512.png');

await sharp(Buffer.from(d20Svg))
  .resize(180, 180)
  .png()
  .toFile(resolve(publicDir, 'apple-touch-icon.png'));
console.log('Wrote apple-touch-icon.png');

await sharp(Buffer.from(d20Svg))
  .resize(120, 120)
  .png()
  .toFile(resolve(publicDir, 'favicon.png'));
console.log('Wrote favicon.png');

console.log('Done.');
