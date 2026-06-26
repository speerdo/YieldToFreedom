/**
 * One-off: download the Unsplash images the site references, convert them to
 * right-sized WebP, and write them into public/images/ so we self-host + optimize.
 * Run: npx tsx scripts/localize-unsplash.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'images', 'unsplash');

// photoSlug (everything after "photo-") -> output width.
// Hero is full-bleed (large); cards/blog heros render <= 1200px wide.
const IMAGES: Array<{ slug: string; width: number }> = [
  { slug: '1460925895917-afdab827c52f', width: 1920 }, // home hero (LCP)
  { slug: '1526304640581-d334cdbbf45e', width: 1200 }, // home card
  { slug: '1464822759023-fed622ff2c3b', width: 1200 }, // home card
  { slug: '1466692476868-aef1dfb1e735', width: 1200 }, // home card + drip blog
  { slug: '1590283603385-17ffb3a7f29f', width: 1200 }, // what-is-jepi
  { slug: '1611974789855-9c2a0a7236a3', width: 1200 }, // jepi-vs-jepq
  { slug: '1551288049-bebda4e38f71', width: 1200 }, // grading-explained
  { slug: '1579621970563-ebec7560ff3e', width: 1200 }, // schd-vs-jepi
  { slug: '1560518883-ce09059eeffa', width: 1200 }, // rental-property
  { slug: '1579621970795-87facc2f976d', width: 1200 }, // income-investing
  { slug: '1554224155-6726b3ff858f', width: 1200 }, // 40-30-30
];

async function run() {
  await mkdir(outDir, { recursive: true });
  for (const { slug, width } of IMAGES) {
    // Pull a high-quality source a bit larger than our target, then downscale.
    const srcW = Math.min(Math.round(width * 1.25), 2400);
    const url = `https://images.unsplash.com/photo-${slug}?auto=format&fit=crop&w=${srcW}&q=85`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${slug}: ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const file = path.join(outDir, `${slug}.webp`);
    await writeFile(file, out);
    console.log(`✓ ${slug}.webp  ${(out.length / 1024).toFixed(0)} KB  (${width}w)`);
  }
  console.log(`\nDone. ${IMAGES.length} images written to public/images/unsplash/`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
