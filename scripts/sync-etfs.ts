/**
 * Full ETF sync: prices, metadata, dividends, yield, returns.
 * Mirrors the nightly cron at /api/cron/sync-etfs but runs locally
 * so it is not subject to Vercel function timeouts.
 *
 * Usage:
 *   npx tsx scripts/sync-etfs.ts
 *
 * Safe to re-run: all DB writes use ON CONFLICT DO UPDATE.
 * Rate limit: 200 ms between tickers (Tiingo free: 500 req/hour).
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfDividends, etfPrices, etfs } from '../src/lib/db/schema';
import {
  tiingoMeta,
  tiingoPrices,
  tiingoDividends,
  type TiingoEodRow,
  type TiingoDividendRow,
} from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function computeReturns(sortedAsc: TiingoEodRow[], latestAdjClose: number, inceptionDate: string | null) {
  // Strip pre-inception rows so renamed tickers (e.g. WPAY→TOPW) don't
  // produce phantom returns anchored to the prior fund's price history.
  const rows = inceptionDate
    ? sortedAsc.filter(r => r.date.slice(0, 10) >= inceptionDate)
    : sortedAsc;

  function makeReturn(yearsBack: number): string | null {
    const cutoff = dateYearsAgo(yearsBack);
    let lo = 0, hi = rows.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (rows[mid]!.date.slice(0, 10) <= cutoff) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (best < 0) return null;
    const row = rows[best]!;
    const anchorDate = row.date.slice(0, 10);
    const anchor = asNumber(row.adjClose ?? row.close);
    if (anchor == null || anchor <= 0) return null;
    const gapDays = (new Date(cutoff).getTime() - new Date(anchorDate).getTime()) / 86_400_000;
    if (gapDays > 10) return null;
    const ratio = latestAdjClose / anchor;
    const r = yearsBack === 1 ? ratio - 1 : Math.pow(ratio, 1 / yearsBack) - 1;
    return r.toFixed(6);
  }
  return { return1y: makeReturn(1), return3y: makeReturn(3), return5y: makeReturn(5) };
}

function inferDividendFrequency(rows: TiingoEodRow[]): string | null {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  const cutoff = d.toISOString().slice(0, 10);
  const count = rows.filter(r => r.date.slice(0, 10) >= cutoff && r.divCash > 0).length;
  if (count >= 40) return 'weekly';
  if (count >= 10) return 'monthly';
  if (count >= 3) return 'quarterly';
  if (count >= 1) return 'annual';
  return null;
}

function buildDividendRows(rows: TiingoDividendRow[], etfId: number) {
  const out = [];
  for (const row of rows) {
    const exDate = parseIsoDate(row.exDate);
    const amount = asNumber(row.divCash);
    if (!exDate || amount == null || amount <= 0) continue;
    const adjAmount = asNumber(row.adjDivCash ?? null);
    out.push({
      etfId, exDate,
      paymentDate: parseIsoDate(row.payDate ?? null),
      declaredDate: parseIsoDate(row.declaredDate ?? null),
      recordDate: parseIsoDate(row.recordDate ?? null),
      amount: amount.toFixed(6),
      yieldAtPayment: null,
      adjAmount: adjAmount != null ? adjAmount.toFixed(6) : null,
    });
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}

function buildDividendRowsFromEod(rows: TiingoEodRow[], etfId: number) {
  const out = [];
  for (const row of rows) {
    if (!row.divCash || row.divCash <= 0) continue;
    const exDate = parseIsoDate(row.date);
    if (!exDate) continue;
    out.push({
      etfId, exDate,
      paymentDate: null, declaredDate: null, recordDate: null,
      amount: row.divCash.toFixed(6),
      yieldAtPayment: null,
      adjAmount: null,
    });
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}

const active = await db.select().from(etfs).where(eq(etfs.isActive, true));
const fiveYearsAgo = dateYearsAgo(5);
const twoYearsAgo = dateYearsAgo(2);
const todayUtc = new Date().toISOString().slice(0, 10);

console.log(`Syncing ${active.length} active ETFs from ${fiveYearsAgo}…\n`);

let updated = 0;
let dividendRows = 0;
let errors = 0;

for (const row of active) {
  try {
    // 1. Prices (5y)
    let latestPrice: number | null = null;
    let latestAdjClose: number | null = null;
    let historyRows: TiingoEodRow[] = [];
    let sortedAsc: TiingoEodRow[] = [];
    try {
      historyRows = await tiingoPrices(row.ticker, { startDate: fiveYearsAgo });
      if (historyRows.length > 0) {
        sortedAsc = [...historyRows].sort((a, b) => a.date.localeCompare(b.date));
        const newest = sortedAsc[sortedAsc.length - 1]!;
        latestAdjClose = asNumber(newest.adjClose ?? newest.close);
        latestPrice = latestAdjClose;
      }
    } catch { /* price fetch failed */ }

    // 2. Metadata
    let exchangeCode: string | null = null;
    let inceptionDate: string | null = null;
    try {
      const meta = await tiingoMeta(row.ticker);
      exchangeCode = meta.exchangeCode ?? null;
      inceptionDate = parseIsoDate(meta.startDate);
    } catch { /* meta fetch failed */ }

    // 3. Dividends (dedicated endpoint, fallback to EOD)
    let divRows: TiingoDividendRow[] = [];
    let usedEodFallback = false;
    try {
      divRows = await tiingoDividends(row.ticker, { startDate: twoYearsAgo });
      if (divRows.length === 0) usedEodFallback = true;
    } catch { usedEodFallback = true; }

    // 4. Trailing 12m yield
    const cutoff12m = dateYearsAgo(1);
    let trailing12mSum = 0;
    if (!usedEodFallback && divRows.length > 0) {
      for (const d of divRows) {
        const exDate = parseIsoDate(d.exDate);
        if (exDate && exDate >= cutoff12m) trailing12mSum += asNumber(d.divCash) ?? 0;
      }
    } else {
      for (const r of historyRows) {
        const d = parseIsoDate(r.date);
        if (d && d >= cutoff12m && r.divCash > 0) trailing12mSum += r.divCash;
      }
    }
    const trailingYield =
      latestPrice != null && latestPrice > 0 && trailing12mSum > 0
        ? (trailing12mSum / latestPrice).toFixed(6)
        : undefined;

    // 5. Returns
    const returns =
      latestAdjClose != null && latestAdjClose > 0 && sortedAsc.length > 0
        ? computeReturns(sortedAsc, latestAdjClose, inceptionDate)
        : { return1y: null, return3y: null, return5y: null };

    // 6. Dividend frequency
    const freqInferred = historyRows.length > 0 ? inferDividendFrequency(historyRows) : null;

    // 7. Upsert ETF metrics
    await db.update(etfs).set({
      lastPrice: latestPrice != null && latestPrice > 0 ? latestPrice.toFixed(4) : (row.lastPrice ?? null),
      lastYield: trailingYield ?? row.lastYield,
      trailing12mYield: trailingYield ?? row.trailing12mYield,
      exchange: exchangeCode ?? row.exchange,
      ...(inceptionDate && !row.inceptionDate ? { inceptionDate } : {}),
      ...(freqInferred && !row.dividendFrequency ? { dividendFrequency: freqInferred } : {}),
      ...(returns.return1y != null ? { return1y: returns.return1y } : {}),
      ...(returns.return3y != null ? { return3y: returns.return3y } : {}),
      ...(returns.return5y != null ? { return5y: returns.return5y } : {}),
      dataLastSynced: new Date(),
    }).where(eq(etfs.id, row.id));

    // 8. Today's price row
    if (latestPrice != null && latestPrice > 0) {
      const todayRow = historyRows.find((r) => parseIsoDate(r.date) === todayUtc);
      await db.insert(etfPrices).values({
        etfId: row.id, date: todayUtc,
        open: todayRow?.open != null ? String(todayRow.open) : null,
        high: todayRow?.high != null ? String(todayRow.high) : null,
        low: todayRow?.low != null ? String(todayRow.low) : null,
        close: latestPrice.toFixed(4),
        adjClose: todayRow?.adjClose != null ? String(todayRow.adjClose) : latestPrice.toFixed(4),
        volume: todayRow?.volume ?? null,
      }).onConflictDoUpdate({
        target: [etfPrices.etfId, etfPrices.date],
        set: {
          close: latestPrice.toFixed(4),
          adjClose: todayRow?.adjClose != null ? String(todayRow.adjClose) : latestPrice.toFixed(4),
        },
      });
    }

    // 9. Dividend history upsert
    const dbDivRows = usedEodFallback
      ? buildDividendRowsFromEod(historyRows, row.id)
      : buildDividendRows(divRows, row.id);

    for (const dRow of dbDivRows) {
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
      dividendRows++;
    }

    const r1y = returns.return1y != null ? `${(Number(returns.return1y) * 100).toFixed(1)}%` : 'n/a';
    console.log(`  ✓ ${row.ticker.padEnd(6)}  price=${latestPrice?.toFixed(2) ?? 'n/a'}  1y=${r1y}  divs=${dbDivRows.length}`);
    updated++;
  } catch (err) {
    console.error(`  ✗ ${row.ticker}: ${err instanceof Error ? err.message : err}`);
    errors++;
  }

  await sleep(200);
}

console.log(`\nDone. ${updated} synced, ${dividendRows} dividend rows upserted, ${errors} errors.`);
