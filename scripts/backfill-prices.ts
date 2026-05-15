/**
 * One-time backfill: populate etf_prices with ~14 months of daily EOD history
 * for every active ETF that has a lastPrice (i.e., Tiingo knows about it).
 *
 * The nightly sync-etfs cron adds one row per day going forward; this script
 * fills the historical window so the /compare price and total-return charts
 * have data to display immediately.
 *
 * Usage:
 *   npm run backfill:prices
 *
 * Safe to re-run: INSERT ... ON CONFLICT DO NOTHING skips already-present rows.
 */
import 'dotenv/config';

import { eq, isNotNull } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfPrices, etfs } from '../src/lib/db/schema';
import { tiingoPrices } from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function dateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const allEtfs = await db
  .select({ id: etfs.id, ticker: etfs.ticker })
  .from(etfs)
  .where(isNotNull(etfs.lastPrice))
  .orderBy(etfs.ticker);

const startDate = dateMonthsAgo(14);
console.log(`Backfilling prices from ${startDate} for ${allEtfs.length} ETFs…\n`);

let done = 0;
let skipped = 0;

for (const etf of allEtfs) {
  try {
    let rows;
    try {
      rows = await tiingoPrices(etf.ticker, { startDate });
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('429')) throw inner;
      console.log(`  - ${etf.ticker.padEnd(6)} not in Tiingo`);
      skipped++;
      continue;
    }

    if (!rows.length) {
      console.log(`  - ${etf.ticker.padEnd(6)} no data`);
      skipped++;
      continue;
    }

    const priceRows = rows
      .map((r) => ({
        etfId: etf.id,
        date: String(r.date).slice(0, 10),
        open: r.open != null ? String(r.open) : null,
        high: r.high != null ? String(r.high) : null,
        low: r.low != null ? String(r.low) : null,
        close: String(r.close),
        adjClose: r.adjClose != null ? String(r.adjClose) : String(r.close),
        volume: r.volume ?? null,
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));

    // Insert in batches of 100 to avoid oversized queries
    for (let i = 0; i < priceRows.length; i += 100) {
      await db.insert(etfPrices).values(priceRows.slice(i, i + 100)).onConflictDoNothing();
    }

    console.log(`  ✓ ${etf.ticker.padEnd(6)} ${rows.length} rows`);
    done++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429')) {
      console.error(`\n  ⛔ Rate limit hit after ${done} ETFs. Wait ~1 hour and re-run.\n`);
      process.exit(1);
    }
    console.error(`  ✗ ${etf.ticker}: ${msg}`);
    skipped++;
  }

  await sleep(250);
}

console.log(`\nDone. ${done} ETFs backfilled, ${skipped} skipped.`);
