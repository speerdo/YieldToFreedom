/**
 * Generates /public/og-default.png (1200×630) and /public/apple-touch-icon.png (180×180)
 * using sharp (already a dependency of Astro).
 *
 * Usage:  npx tsx scripts/generate-og-image.ts
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const PUBLIC = join(process.cwd(), 'public');

// ── OG Default Image 1200×630 ──────────────────────────────────────────────
// Uses the site's hero background photo with a slate gradient overlay (like the
// homepage hero) and the centered Yield to Freedom logo (bar-chart mark +
// wordmark + tagline) on top.

const HERO_BG = join(PUBLIC, 'images/unsplash/1460925895917-afdab827c52f.webp');

// Overlay + centered logo, rendered on top of the hero photo.
// The bar-chart mark mirrors src/components/layout/Logo.astro (96×96 viewBox),
// scaled and translated so the whole logo group is centered.
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ov" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#0f172a" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.70"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="42%" r="70%">
      <stop offset="40%" stop-color="#020617" stop-opacity="0"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.55"/>
    </radialGradient>
  </defs>

  <!-- Slate overlay (matches homepage hero) -->
  <rect width="1200" height="630" fill="url(#ov)"/>
  <rect width="1200" height="630" fill="url(#vignette)"/>

  <!-- Logo mark: three ascending bars, centered. 96×96 viewBox scaled ×1.7 (≈163px),
       centered at x=600 → translate x = 600 - 81.5 = 518.5 -->
  <g transform="translate(518.5,120) scale(1.7)">
    <rect x="14" y="60" width="16" height="22" rx="3" fill="#2563eb" opacity="0.35"/>
    <rect x="38" y="44" width="16" height="38" rx="3" fill="#2563eb" opacity="0.6"/>
    <rect x="62" y="24" width="16" height="58" rx="3" fill="#2563eb"/>
  </g>

  <!-- Wordmark -->
  <text x="600" y="380" text-anchor="middle"
    font-family="Inter, 'Liberation Sans', 'Helvetica Neue', Arial, sans-serif"
    font-size="74" font-weight="700" fill="#f8fafc" letter-spacing="-1.5">Yield to Freedom</text>

  <!-- Tagline -->
  <text x="600" y="438" text-anchor="middle"
    font-family="Inter, 'Liberation Sans', 'Helvetica Neue', Arial, sans-serif"
    font-size="28" font-weight="500" fill="#cbd5e1" letter-spacing="0.5">Build Income. Reach Freedom.</text>

  <!-- URL -->
  <text x="600" y="540" text-anchor="middle"
    font-family="Inter, 'Liberation Sans', 'Helvetica Neue', Arial, sans-serif"
    font-size="22" font-weight="600" fill="#60a5fa" letter-spacing="3">YIELDTOFREEDOM.COM</text>
</svg>`;

await sharp(HERO_BG)
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
  .png()
  .toFile(join(PUBLIC, 'og-default.png'));

console.log('✓ og-default.png  (1200×630)');

// ── Apple Touch Icon 180×180 ───────────────────────────────────────────────

const ati = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="180" height="180" rx="36" fill="url(#bg)"/>
  <!-- Y letter mark -->
  <text x="90" y="108" font-family="Georgia, serif" font-size="96" font-weight="700"
    fill="#2563eb" text-anchor="middle">Y</text>
  <!-- small accent dot -->
  <circle cx="90" cy="148" r="7" fill="#3b82f6"/>
</svg>`;

await sharp(Buffer.from(ati))
  .resize(180, 180)
  .png()
  .toFile(join(PUBLIC, 'apple-touch-icon.png'));

console.log('✓ apple-touch-icon.png  (180×180)');

// ── favicon.png fallback 32×32 ─────────────────────────────────────────────
const fav = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1e3a5f"/>
  <text x="16" y="24" font-family="Georgia, serif" font-size="22" font-weight="700"
    fill="#2563eb" text-anchor="middle">Y</text>
</svg>`;

await sharp(Buffer.from(fav))
  .resize(32, 32)
  .png()
  .toFile(join(PUBLIC, 'favicon-32.png'));

console.log('✓ favicon-32.png  (32×32)');

writeFileSync(
  join(PUBLIC, 'site.webmanifest'),
  JSON.stringify(
    {
      name: 'Yield to Freedom',
      short_name: 'YTF',
      description: 'Income ETF research, strategy, and tools',
      start_url: '/',
      display: 'browser',
      background_color: '#0f172a',
      theme_color: '#2563eb',
      icons: [
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      ],
    },
    null,
    2,
  ),
);

console.log('✓ site.webmanifest');
console.log('\nAll assets written to /public/');
