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

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative bar chart (subtle, right side) -->
  <rect x="820" y="320" width="44" height="180" rx="6" fill="#1e3a5f" opacity="0.7"/>
  <rect x="878" y="250" width="44" height="250" rx="6" fill="#1e3a5f" opacity="0.7"/>
  <rect x="936" y="190" width="44" height="310" rx="6" fill="#1e3a5f" opacity="0.7"/>
  <rect x="994" y="280" width="44" height="220" rx="6" fill="#1e3a5f" opacity="0.7"/>
  <rect x="1052" y="220" width="44" height="280" rx="6" fill="#1e3a5f" opacity="0.7"/>
  <rect x="1110" y="160" width="44" height="340" rx="6" fill="#2563eb" opacity="0.5"/>

  <!-- Trend line overlay -->
  <polyline points="842,460 900,390 958,330 1016,370 1074,300 1132,230"
    fill="none" stroke="#3b82f6" stroke-width="3" opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Accent stripe -->
  <rect x="80" y="80" width="6" height="120" rx="3" fill="url(#accent)"/>

  <!-- Site name -->
  <text x="108" y="138" font-family="Georgia, 'Times New Roman', serif"
    font-size="64" font-weight="700" fill="#f8fafc" letter-spacing="-1">
    Yield to Freedom
  </text>

  <!-- Tagline -->
  <text x="108" y="190" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="26" fill="#94a3b8" letter-spacing="0.5">
    Income ETF Research, Strategy &amp; Tools
  </text>

  <!-- Divider -->
  <rect x="108" y="220" width="480" height="2" rx="1" fill="#334155"/>

  <!-- Three pillars row -->
  <!-- Income pill -->
  <rect x="108" y="255" width="130" height="38" rx="19" fill="#1e3a5f"/>
  <text x="173" y="279" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="16" fill="#60a5fa" text-anchor="middle" font-weight="600">📈 Income</text>

  <!-- Stability pill -->
  <rect x="252" y="255" width="140" height="38" rx="19" fill="#1e1e40"/>
  <text x="322" y="279" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="16" fill="#a78bfa" text-anchor="middle" font-weight="600">🛡 Stability</text>

  <!-- Growth pill -->
  <rect x="406" y="255" width="120" height="38" rx="19" fill="#0f2e1f"/>
  <text x="466" y="279" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="16" fill="#34d399" text-anchor="middle" font-weight="600">🌱 Growth</text>

  <!-- Main value proposition -->
  <text x="108" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="30" fill="#e2e8f0" font-weight="500">
    Build income that pays you — every month.
  </text>
  <text x="108" y="422" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="22" fill="#64748b">
    229 ETFs graded, scored, and explained. Free.
  </text>

  <!-- URL badge -->
  <rect x="108" y="510" width="290" height="48" rx="10" fill="#2563eb" opacity="0.15"/>
  <rect x="108" y="510" width="290" height="48" rx="10" fill="none" stroke="#2563eb" stroke-width="1.5" opacity="0.4"/>
  <text x="253" y="540" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="20" fill="#60a5fa" text-anchor="middle" font-weight="600" letter-spacing="0.5">
    yieldtofreedom.com
  </text>
</svg>`;

await sharp(Buffer.from(og))
  .resize(1200, 630)
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
