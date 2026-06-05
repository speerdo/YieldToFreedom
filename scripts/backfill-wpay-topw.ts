/**
 * Backfill TOPW (formerly WPAY) historical prices and dividends.
 *
 * TOPW is the same fund as WPAY — it was renamed at some point in late 2025.
 * Tiingo serves TOPW's current data fine, but dividend and price history from
 * the WPAY era (April 2025 – early 2026) is only available under the old ticker.
 *
 * This script:
 *   1. Fetches historical prices under both 'wpay' and 'topw' and upserts both.
 *   2. Fetches dividends under both tickers, deduplicates by ex-date, upserts all.
 *   3. Recalculates trailing_12m_yield from the now-complete dividend table.
 *   4. Fixes dividend_frequency to 'weekly' (ex-dates are ~7 days apart).
 *   5. Clears return_1y/3y/5y so the next nightly sync recalculates them cleanly
 *      from the stitched price history.
 *
 * Usage:
 *   npx tsx scripts/backfill-wpay-topw.ts
 *
 * Safe to re-run: all DB writes use ON CONFLICT DO UPDATE / DO NOTHING.
 */
import 'dotenv/config';

import { eq, sql } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfDividends, etfPrices, etfs } from '../src/lib/db/schema';
import { tiingoDividends, tiingoPrices, type TiingoDividendRow, type TiingoEodRow } from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// ─── 1. Find TOPW in DB ──────────────────────────────────────────────────────
const [topw] = await db.select().from(etfs).where(eq(etfs.ticker, 'TOPW'));
if (!topw) {
  console.error('TOPW not found in etfs table. Run seed-etfs.ts first.');
  process.exit(1);
}
console.log(`Found TOPW (id=${topw.id}). Starting backfill…\n`);

const START_DATE = '2025-04-01'; // fund inception

// ─── 2. Prices: fetch under both tickers, merge by date ─────────────────────

async function fetchPricesSafe(ticker: string): Promise<TiingoEodRow[]> {
  try {
    const rows = await tiingoPrices(ticker, { startDate: START_DATE });
    console.log(`  Tiingo prices ${ticker}: ${rows.length} rows`);
    return rows;
  } catch (err) {
    console.warn(`  Tiingo prices ${ticker} failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

await sleep(200);
const wpayPrices = await fetchPricesSafe('wpay');
await sleep(200);
const topwPrices = await fetchPricesSafe('topw');

// Merge: TOPW rows take precedence when both have the same date
const priceByDate = new Map<string, TiingoEodRow>();
for (const row of wpayPrices) {
  const d = parseIsoDate(row.date);
  if (d) priceByDate.set(d, row);
}
for (const row of topwPrices) {
  const d = parseIsoDate(row.date);
  if (d) priceByDate.set(d, row); // TOPW overwrites WPAY for same date
}

const allPriceRows = [...priceByDate.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([date, r]) => {
    if (r.close == null) return [];
    const close = String(r.close);
    return [{
      etfId: topw.id,
      date,
      open:     r.open     != null ? String(r.open)     : null,
      high:     r.high     != null ? String(r.high)     : null,
      low:      r.low      != null ? String(r.low)      : null,
      close,
      adjClose: r.adjClose != null ? String(r.adjClose) : close,
      volume:   r.volume   ?? null,
    }];
  });

console.log(`\n  Merged price rows: ${allPriceRows.length} unique dates`);

// Upsert in batches of 100
let priceUpserted = 0;
for (let i = 0; i < allPriceRows.length; i += 100) {
  await db.insert(etfPrices).values(allPriceRows.slice(i, i + 100)).onConflictDoUpdate({
    target: [etfPrices.etfId, etfPrices.date],
    set: {
      open:     sql`excluded.open`,
      high:     sql`excluded.high`,
      low:      sql`excluded.low`,
      close:    sql`excluded.close`,
      adjClose: sql`excluded.adj_close`,
      volume:   sql`excluded.volume`,
    },
  });
  priceUpserted += Math.min(100, allPriceRows.length - i);
}
console.log(`  ✓ Upserted ${priceUpserted} price rows`);

// ─── 3. Dividends: fetch dedicated endpoint for both tickers ─────────────────

async function fetchDividendsSafe(ticker: string): Promise<TiingoDividendRow[]> {
  try {
    const rows = await tiingoDividends(ticker, { startDate: START_DATE });
    console.log(`\n  Tiingo dividends ${ticker}: ${rows.length} rows`);
    return rows;
  } catch (err) {
    // 404 = ticker not in Tiingo's dividends DB (common for new/renamed funds); EOD fallback handles it
    console.warn(`  Tiingo dividends ${ticker} failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

await sleep(200);
const wpayDivs = await fetchDividendsSafe('wpay');
await sleep(200);
const topwDivs = await fetchDividendsSafe('topw');

// Also extract from EOD divCash > 0 rows as a fallback to catch anything missed
function eodToDivRows(priceRows: TiingoEodRow[]): TiingoDividendRow[] {
  return priceRows
    .filter(r => r.divCash > 0)
    .map(r => ({ exDate: r.date, divCash: r.divCash, adjDivCash: undefined }));
}
const wpayEodDivs = eodToDivRows(wpayPrices);
const topwEodDivs = eodToDivRows(topwPrices);
console.log(`\n  EOD divCash fallback — wpay: ${wpayEodDivs.length} rows, topw: ${topwEodDivs.length} rows`);

// Merge all dividend sources by ex-date; dedicated endpoint takes precedence
const divByDate = new Map<string, { amount: number }>();

// Add EOD fallbacks first (lowest priority)
for (const src of [wpayEodDivs, topwEodDivs]) {
  for (const r of src) {
    const d = parseIsoDate(r.exDate);
    const amt = asNumber(r.divCash);
    if (d && amt && amt > 0) divByDate.set(d, { amount: amt });
  }
}
// Dedicated endpoint overwrites (higher priority)
for (const src of [wpayDivs, topwDivs]) {
  for (const r of src) {
    const d = parseIsoDate(r.exDate);
    const amt = asNumber(r.divCash);
    if (d && amt && amt > 0) divByDate.set(d, { amount: amt });
  }
}

const allDivRows = [...divByDate.entries()]
  .sort(([a], [b]) => b.localeCompare(a)) // newest first
  .map(([exDate, { amount }]) => ({
    etfId: topw.id,
    exDate,
    paymentDate:   null as string | null,
    declaredDate:  null as string | null,
    recordDate:    null as string | null,
    amount:        amount.toFixed(6),
    adjAmount:     null as string | null,
    yieldAtPayment: null as string | null,
  }));

console.log(`\n  Total unique dividend ex-dates: ${allDivRows.length}`);

// Upsert dividend rows
for (const row of allDivRows) {
  await db.insert(etfDividends).values(row).onConflictDoUpdate({
    target: [etfDividends.etfId, etfDividends.exDate],
    set: { amount: row.amount },
  });
}
console.log(`  ✓ Upserted ${allDivRows.length} dividend rows`);

// ─── 4. Recalculate trailing 12m yield ───────────────────────────────────────

const cutoff12m = dateYearsAgo(1);
const trailing12mSum = allDivRows
  .filter(r => r.exDate >= cutoff12m)
  .reduce((sum, r) => sum + Number(r.amount), 0);

const latestClose = asNumber(topw.lastPrice);
const trailingYield = latestClose && latestClose > 0 && trailing12mSum > 0
  ? (trailing12mSum / latestClose).toFixed(6)
  : null;

console.log(`\n  Trailing 12m dividend sum: $${trailing12mSum.toFixed(4)}`);
console.log(`  Latest price: $${latestClose?.toFixed(2) ?? 'n/a'}`);
console.log(`  Recalculated trailing 12m yield: ${trailingYield ? `${(Number(trailingYield) * 100).toFixed(2)}%` : 'n/a'}`);

// ─── 5. Update ETF record ────────────────────────────────────────────────────

await db.update(etfs).set({
  dividendFrequency: 'weekly',
  ...(trailingYield ? { lastYield: trailingYield, trailing12mYield: trailingYield } : {}),
  // Clear stale return metrics — nightly sync will recalculate from stitched history
  return1y: null,
  return3y: null,
  return5y: null,
  updatedAt: new Date(),
}).where(eq(etfs.id, topw.id));

console.log('\n  ✓ Updated etfs record:');
console.log(`    dividend_frequency: weekly`);
if (trailingYield) console.log(`    last_yield / trailing_12m_yield: ${(Number(trailingYield) * 100).toFixed(2)}%`);
console.log(`    return_1y/3y/5y: cleared (will recalculate on next sync)`);

console.log('\nDone. Run npx tsx scripts/sync-etfs.ts to refresh returns from complete history.');
