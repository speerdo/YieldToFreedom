/**
 * Backfill ETF issuer product-page URLs from FMP /profile (website field).
 *
 * Only fills rows where website is currently NULL - safe to re-run.
 * Pass --force to overwrite all rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-etf-websites.ts
 *   npx tsx scripts/backfill-etf-websites.ts --force
 */
import 'dotenv/config';

import { eq, isNull } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';
import { fmpGet } from '../src/lib/fmp/client';

const FORCE = process.argv.includes('--force');

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

interface FmpProfile {
  website?: string;
}

async function fetchWebsite(ticker: string): Promise<string | null> {
  try {
    const rows = await fmpGet<FmpProfile[]>('/profile', { symbol: ticker });
    const url = rows?.[0]?.website?.trim();
    return url && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

const targets = await db
  .select({ id: etfs.id, ticker: etfs.ticker, website: etfs.website })
  .from(etfs)
  .where(FORCE ? eq(etfs.isActive, true) : isNull(etfs.website))
  .orderBy(etfs.ticker);

console.log(`Backfilling issuer websites for ${targets.length} ETFs (force=${FORCE})…\n`);

let done = 0;
let skipped = 0;

for (const etf of targets) {
  try {
    const website = await fetchWebsite(etf.ticker);
    await sleep(150);

    if (!website) {
      console.log(`  - ${etf.ticker} (no website returned)`);
      skipped++;
      continue;
    }

    await db.update(etfs).set({ website }).where(eq(etfs.id, etf.id));
    console.log(`  ✓ ${etf.ticker.padEnd(6)} ${website}`);
    done++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429')) {
      console.error(`\n  ⛔ Rate limit hit after ${done} ETFs. Re-run to resume.\n`);
      process.exit(1);
    }
    console.error(`  ✗ ${etf.ticker}: ${msg}`);
    skipped++;
  }
}

console.log(`\nDone. ${done} updated, ${skipped} unchanged/skipped.`);
