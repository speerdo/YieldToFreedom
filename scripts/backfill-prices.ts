/**
 * One-time/re-runnable backfill: populate etf_prices with daily EOD history
 * for every active ETF, floored at each ETF's inception date so new funds don't
 * request data before they existed.
 *
 * The nightly sync-etfs cron adds one row per day going forward; this script
 * fills the historical window so the /compare price and total-return charts
 * have rich data to display.
 *
 * Usage:
 *   npm run backfill:prices
 *   npm run backfill:prices -- --years=10
 *   npm run backfill:prices -- --start=2010-01-01
 *
 * Safe to re-run: INSERT ... ON CONFLICT DO UPDATE refreshes existing rows.
 */
import 'dotenv/config';

import { isNotNull, sql } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfPrices, etfs } from '../src/lib/db/schema';
import { tiingoPrices } from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function requestedStartDate(): string {
  const explicitStart = argValue('start');
  if (explicitStart && /^\d{4}-\d{2}-\d{2}$/.test(explicitStart)) return explicitStart;
  const years = Number(argValue('years') ?? process.env.ETF_BACKFILL_YEARS ?? '10');
  return dateYearsAgo(Number.isFinite(years) && years > 0 ? years : 10);
}

const requestedStart = requestedStartDate();

/** Use ETF inception date as floor and the requested backfill date as ceiling. */
function etfStartDate(inceptionDate: string | null): string {
  if (!inceptionDate) return requestedStart;
  const inc = String(inceptionDate).slice(0, 10);
  return inc > requestedStart ? inc : requestedStart;
}

const allEtfs = await db
  .select({ id: etfs.id, ticker: etfs.ticker, inceptionDate: etfs.inceptionDate })
  .from(etfs)
  .where(isNotNull(etfs.lastPrice))
  .orderBy(etfs.ticker);

console.log(`Backfilling prices from ${requestedStart} (floored at inception) for ${allEtfs.length} ETFs…\n`);

let done = 0;
let skipped = 0;

for (const etf of allEtfs) {
  const startDate = etfStartDate(etf.inceptionDate ? String(etf.inceptionDate) : null);

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

    for (let i = 0; i < priceRows.length; i += 100) {
      const batch = priceRows.slice(i, i + 100);
      await db.insert(etfPrices).values(batch).onConflictDoUpdate({
        target: [etfPrices.etfId, etfPrices.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          adjClose: sql`excluded.adj_close`,
          volume: sql`excluded.volume`,
        },
      });
    }

    console.log(`  ✓ ${etf.ticker.padEnd(6)} ${rows.length} rows  (from ${startDate})`);
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
