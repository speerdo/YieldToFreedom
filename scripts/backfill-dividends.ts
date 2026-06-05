/**
 * Backfill etf_dividends for active dividend-paying ETFs.
 *
 * Uses Tiingo's dedicated dividends endpoint first so adjDivCash can be stored
 * when available. Falls back to EOD price history rows where divCash > 0 for
 * tickers the dividends endpoint does not support.
 *
 * Usage:
 *   npm run backfill:dividends
 *   npm run backfill:dividends -- --years=10
 *   npm run backfill:dividends -- --start=2010-01-01
 *   npm run backfill:dividends -- --years=10 --tickers=SCHD,HDV,VGT
 *
 * Safe to re-run: INSERT … ON CONFLICT DO UPDATE refreshes existing rows.
 * Rate limit: 250 ms between requests; exits cleanly on 429 so you can resume.
 */
import 'dotenv/config';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfDividends, etfs } from '../src/lib/db/schema';
import {
  tiingoDividends,
  tiingoPrices,
  type TiingoDividendRow,
  type TiingoEodRow,
} from '../src/lib/tiingo/client';

type DividendBackfillRow = {
  etfId: number;
  exDate: string;
  paymentDate: string | null;
  declaredDate: string | null;
  recordDate: string | null;
  amount: string;
  adjAmount: string | null;
  yieldAtPayment: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function requestedStartDate(): string {
  const explicitStart = argValue('start');
  if (explicitStart && /^\d{4}-\d{2}-\d{2}$/.test(explicitStart)) return explicitStart;
  const years = Number(argValue('years') ?? process.env.ETF_BACKFILL_YEARS ?? '10');
  return dateYearsAgo(Number.isFinite(years) && years > 0 ? years : 10);
}

function requestedTickers(): Set<string> | null {
  const raw = argValue('tickers') ?? argValue('ticker');
  if (!raw) return null;
  const tickers = raw
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
  return tickers.length ? new Set(tickers) : null;
}

function parseDate(s: string): string | null {
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitAdjustmentForDate(
  exDate: string,
  splitEvents: Array<{ date: string; factor: number }>,
): number {
  return splitEvents.reduce((factor, event) => (
    event.date > exDate ? factor * event.factor : factor
  ), 1);
}

function adjustedAmount(
  amount: number,
  exDate: string,
  splitEvents: Array<{ date: string; factor: number }>,
  providerAdjustedAmount: number | null = null,
): string {
  if (providerAdjustedAmount != null && providerAdjustedAmount > 0) {
    return providerAdjustedAmount.toFixed(6);
  }
  return (amount / splitAdjustmentForDate(exDate, splitEvents)).toFixed(6);
}

function splitEventsFromPrices(rows: TiingoEodRow[]): Array<{ date: string; factor: number }> {
  return rows
    .map((row) => {
      const date = parseDate(row.date);
      const factor = asNumber(row.splitFactor);
      if (!date || factor == null || factor <= 0 || factor === 1) return null;
      return { date, factor };
    })
    .filter((event): event is { date: string; factor: number } => event !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildDividendRows(
  rows: TiingoDividendRow[],
  etfId: number,
  splitEvents: Array<{ date: string; factor: number }>,
): DividendBackfillRow[] {
  return rows
    .map((row) => {
      const exDate = parseDate(row.exDate);
      const amount = asNumber(row.divCash);
      if (!exDate || amount == null || amount <= 0) return null;
      const adjAmount = asNumber(row.adjDivCash ?? null);
      return {
        etfId,
        exDate,
        paymentDate: row.payDate ? parseDate(row.payDate) : null,
        declaredDate: row.declaredDate ? parseDate(row.declaredDate) : null,
        recordDate: row.recordDate ? parseDate(row.recordDate) : null,
        amount: amount.toFixed(6),
        adjAmount: adjustedAmount(amount, exDate, splitEvents, adjAmount),
        yieldAtPayment: null as string | null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

const startDate = requestedStartDate();
const tickerFilter = requestedTickers();

// Target active ETFs that are expected to pay dividends.
const targets = (await db
  .select({ id: etfs.id, ticker: etfs.ticker })
  .from(etfs)
  .where(
    and(
      eq(etfs.isActive, true),
      ne(etfs.dividendFrequency, 'n/a'),
    ),
  )
  .orderBy(etfs.ticker))
  .filter((etf) => !tickerFilter || tickerFilter.has(etf.ticker.toUpperCase()));

console.log(`Backfilling dividends from ${startDate} for ${targets.length} ETFs…\n`);

let done = 0;
let skipped = 0;

for (const etf of targets) {
  try {
    let priceRows: TiingoEodRow[] = [];
    try {
      priceRows = await tiingoPrices(etf.ticker, { startDate });
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('429')) throw inner;
    }
    const splitEvents = splitEventsFromPrices(priceRows);

    let divRows: DividendBackfillRow[];
    try {
      const dedicatedRows = await tiingoDividends(etf.ticker, { startDate });
      divRows = buildDividendRows(dedicatedRows, etf.id, splitEvents);
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('429')) throw inner;
      divRows = [];
    }

    if (!divRows.length) {
      if (!priceRows.length) {
        console.log(`  - ${etf.ticker.padEnd(6)} not in Tiingo`);
        skipped++;
        continue;
      }

      // Extract dividend payments: rows where divCash > 0 are ex-dates
      divRows = priceRows
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
            adjAmount: adjustedAmount(r.divCash, exDate, splitEvents),
            yieldAtPayment: null as string | null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    }

    if (!divRows.length) {
      console.log(`  - ${etf.ticker.padEnd(6)} no dividends in price history`);
      skipped++;
      continue;
    }

    // Upsert in batches of 50
    for (let i = 0; i < divRows.length; i += 50) {
      const batch = divRows.slice(i, i + 50);
      for (const dRow of batch) {
        await db.insert(etfDividends).values(dRow).onConflictDoUpdate({
          target: [etfDividends.etfId, etfDividends.exDate],
          set: {
            amount: dRow.amount,
            adjAmount: dRow.adjAmount,
            paymentDate: dRow.paymentDate,
            recordDate: dRow.recordDate,
            declaredDate: dRow.declaredDate,
          },
        });
      }
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
