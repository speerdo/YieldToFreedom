/**
 * Backfill etf_dividends for active ETFs that currently have zero rows.
 *
 * Uses the same source as the nightly sync: EOD price history from Tiingo,
 * extracting rows where divCash > 0. The dedicated /tiingo/dividends/ endpoint
 * requires a higher plan tier; the EOD approach works on all plans.
 *
 * Usage:
 *   npm run backfill:dividends
 *
 * Safe to re-run: INSERT … ON CONFLICT DO NOTHING skips existing rows.
 * Rate limit: 250 ms between requests; exits cleanly on 429 so you can resume.
 */
import 'dotenv/config';

import { and, eq, ne, notExists, sql } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfDividends, etfs } from '../src/lib/db/schema';
import { tiingoPrices } from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): string | null {
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// Only target ETFs that pay dividends and currently have zero rows
const targets = await db
  .select({ id: etfs.id, ticker: etfs.ticker })
  .from(etfs)
  .where(
    and(
      eq(etfs.isActive, true),
      ne(etfs.dividendFrequency, 'n/a'),
      notExists(
        db.select({ _: sql`1` }).from(etfDividends).where(eq(etfDividends.etfId, etfs.id)),
      ),
    ),
  )
  .orderBy(etfs.ticker);

const startDate = dateYearsAgo(3);
console.log(`Backfilling dividends from ${startDate} for ${targets.length} ETFs…\n`);

let done = 0;
let skipped = 0;

for (const etf of targets) {
  try {
    let priceRows;
    try {
      priceRows = await tiingoPrices(etf.ticker, { startDate });
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('429')) throw inner;
      console.log(`  – ${etf.ticker.padEnd(6)} not in Tiingo (${msg})`);
      skipped++;
      continue;
    }

    // Extract dividend payments: rows where divCash > 0 are ex-dates
    const divRows = priceRows
      .filter((r) => r.divCash > 0)
      .map((r) => {
        const exDate = parseDate(r.date);
        if (!exDate) return null;
        return {
          etfId: etf.id,
          exDate,
          paymentDate: null as string | null,
          declaredDate: null as string | null,
          recordDate: null as string | null,
          amount: r.divCash.toFixed(6),
          adjAmount: null as string | null,
          yieldAtPayment: null as string | null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (!divRows.length) {
      console.log(`  – ${etf.ticker.padEnd(6)} no dividends in price history`);
      skipped++;
      continue;
    }

    // Insert in batches of 50
    for (let i = 0; i < divRows.length; i += 50) {
      await db.insert(etfDividends).values(divRows.slice(i, i + 50)).onConflictDoNothing();
    }

    console.log(`  ✓ ${etf.ticker.padEnd(6)} ${divRows.length} dividends`);
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
