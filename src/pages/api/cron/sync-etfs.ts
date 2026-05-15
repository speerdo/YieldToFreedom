import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';

import {
  tiingoMeta,
  tiingoPrices,
  tiingoDividends,
  type TiingoEodRow,
  type TiingoDividendRow,
} from '../../../lib/tiingo/client';
import { cronAuthorized, cronUnauthorizedResponse } from '../../../lib/http/cron-auth';
import { db } from '../../../lib/db';
import { etfDividends, etfPrices, etfs } from '../../../lib/db/schema';

export const prerender = false;

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract YYYY-MM-DD from a Tiingo date string like "2025-01-15T00:00:00+00:00" */
function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const d = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute total annualised returns using split-and-dividend-adjusted prices.
 * 1-year is simple return; 3-year and 5-year are annualised (CAGR).
 * Returns null for each horizon if the ETF didn't exist that long ago.
 */
function computeReturns(
  sortedAsc: TiingoEodRow[],
  latestAdjClose: number,
): { return1y: string | null; return3y: string | null; return5y: string | null } {
  function makeReturn(yearsBack: number): string | null {
    const cutoff = dateYearsAgo(yearsBack);

    // Binary search for last row on or before cutoff
    let lo = 0;
    let hi = sortedAsc.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedAsc[mid]!.date.slice(0, 10) <= cutoff) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return null;

    const anchorRow = sortedAsc[best]!;
    const anchorDate = anchorRow.date.slice(0, 10);
    const anchor = asNumber(anchorRow.adjClose ?? anchorRow.close);
    if (anchor == null || anchor <= 0) return null;

    // Guard: anchor must be within 10 calendar days of the cutoff (ETF too young otherwise)
    const gapDays = (new Date(cutoff).getTime() - new Date(anchorDate).getTime()) / 86_400_000;
    if (gapDays > 10) return null;

    const ratio = latestAdjClose / anchor;
    const r = yearsBack === 1 ? ratio - 1 : Math.pow(ratio, 1 / yearsBack) - 1;
    return r.toFixed(6);
  }

  return {
    return1y: makeReturn(1),
    return3y: makeReturn(3),
    return5y: makeReturn(5),
  };
}

/**
 * Infer dividend frequency from EOD rows over the past 13 months.
 * 13-month window ensures a full calendar year is always covered.
 */
function inferDividendFrequency(historyRows: TiingoEodRow[]): string | null {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  const cutoff = d.toISOString().slice(0, 10);

  const count = historyRows.filter(r => r.date.slice(0, 10) >= cutoff && r.divCash > 0).length;

  if (count >= 10) return 'monthly';
  if (count >= 3) return 'quarterly';
  if (count >= 1) return 'annual';
  return null;
}

/** Build dividend DB rows from Tiingo /tiingo/dividends/<ticker> response */
function buildDividendRows(
  rows: TiingoDividendRow[],
  etfId: number,
) {
  const out: Array<{
    etfId: number;
    exDate: string;
    paymentDate: string | null;
    declaredDate: string | null;
    recordDate: string | null;
    amount: string;
    yieldAtPayment: null;
    adjAmount: string | null;
  }> = [];

  for (const row of rows) {
    const exDate = parseIsoDate(row.exDate);
    const amount = asNumber(row.divCash);
    if (!exDate || amount == null || amount <= 0) continue;

    const adjAmount = asNumber(row.adjDivCash ?? null);

    out.push({
      etfId,
      exDate,
      paymentDate: parseIsoDate(row.payDate ?? null),
      declaredDate: parseIsoDate(row.declaredDate ?? null),
      recordDate: parseIsoDate(row.recordDate ?? null),
      amount: amount.toFixed(6),
      yieldAtPayment: null,
      adjAmount: adjAmount != null ? adjAmount.toFixed(6) : null,
    });

    if (out.length >= 48) break;
  }

  return out.sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 24);
}

/**
 * Fallback: extract dividend rows from EOD price history (divCash > 0).
 * Used when the dedicated dividends endpoint is unavailable.
 */
function buildDividendRowsFromEod(
  priceRows: TiingoEodRow[],
  etfId: number,
) {
  const out: Array<{
    etfId: number;
    exDate: string;
    paymentDate: string | null;
    declaredDate: string | null;
    recordDate: string | null;
    amount: string;
    yieldAtPayment: null;
    adjAmount: string | null;
  }> = [];

  for (const row of priceRows) {
    if (!row.divCash || row.divCash <= 0) continue;
    const exDate = parseIsoDate(row.date);
    if (!exDate) continue;

    out.push({
      etfId,
      exDate,
      paymentDate: null,
      declaredDate: null,
      recordDate: null,
      amount: row.divCash.toFixed(6),
      yieldAtPayment: null,
      adjAmount: null,
    });

    if (out.length >= 48) break;
  }

  return out.sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 24);
}

export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request)) return cronUnauthorizedResponse();

  const active = await db.select().from(etfs).where(eq(etfs.isActive, true));

  let updated = 0;
  let dividendRows = 0;

  // 5-year lookback covers full return history and 2+ years of dividend data
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const startDate = fiveYearsAgo.toISOString().slice(0, 10);

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const divStartDate = twoYearsAgo.toISOString().slice(0, 10);

  const todayUtc = new Date().toISOString().slice(0, 10);

  for (const row of active) {
    try {
      // ── 1. Fetch 5-year EOD price history ─────────────────────────────────
      let latestPrice: number | null = null;
      let latestAdjClose: number | null = null;
      let historyRows: TiingoEodRow[] = [];
      let sortedAsc: TiingoEodRow[] = [];

      try {
        historyRows = await tiingoPrices(row.ticker, { startDate });
        if (historyRows.length > 0) {
          sortedAsc = [...historyRows].sort((a, b) => a.date.localeCompare(b.date));
          const newest = sortedAsc[sortedAsc.length - 1]!;
          latestAdjClose = asNumber(newest.adjClose ?? newest.close);
          latestPrice = latestAdjClose;
        }
      } catch {
        // price fetch failed - skip price update for this ticker
      }

      // ── 2. Fetch metadata (exchange, inception date) ──────────────────────
      let exchangeCode: string | null = null;
      let inceptionDate: string | null = null;
      try {
        const meta = await tiingoMeta(row.ticker);
        exchangeCode = meta.exchangeCode ?? null;
        inceptionDate = parseIsoDate(meta.startDate);
      } catch {
        // meta fetch failed - use existing values
      }

      // ── 3. Try dedicated dividends endpoint, fallback to EOD divCash ──────
      let divRows: TiingoDividendRow[] = [];
      let usedEodFallback = false;
      try {
        divRows = await tiingoDividends(row.ticker, { startDate: divStartDate });
        if (divRows.length === 0) usedEodFallback = true;
      } catch {
        usedEodFallback = true;
      }

      // ── 4. Compute trailing 12m yield ─────────────────────────────────────
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

      // ── 5. Compute total returns (1y / 3y / 5y) from adjClose history ─────
      const returns =
        latestAdjClose != null && latestAdjClose > 0 && sortedAsc.length > 0
          ? computeReturns(sortedAsc, latestAdjClose)
          : { return1y: null, return3y: null, return5y: null };

      // ── 6. Infer dividend frequency from EOD divCash distribution ─────────
      const freqInferred = historyRows.length > 0
        ? inferDividendFrequency(historyRows)
        : null;

      // ── 7. Upsert ETF metrics ─────────────────────────────────────────────
      await db
        .update(etfs)
        .set({
          lastPrice:
            latestPrice != null && latestPrice > 0
              ? latestPrice.toFixed(4)
              : (row.lastPrice ?? null),
          lastYield: trailingYield ?? row.lastYield,
          trailing12mYield: trailingYield ?? row.trailing12mYield,
          exchange: exchangeCode ?? row.exchange,
          // Only write inceptionDate if not already stored
          ...(inceptionDate && !row.inceptionDate ? { inceptionDate } : {}),
          // Inferred frequency only written when not previously set (manual > auto)
          ...(freqInferred && !row.dividendFrequency ? { dividendFrequency: freqInferred } : {}),
          // Returns always overwritten with latest data
          ...(returns.return1y != null ? { return1y: returns.return1y } : {}),
          ...(returns.return3y != null ? { return3y: returns.return3y } : {}),
          ...(returns.return5y != null ? { return5y: returns.return5y } : {}),
          dataLastSynced: new Date(),
        })
        .where(eq(etfs.id, row.id));

      // ── 8. Upsert today's EOD price row ──────────────────────────────────
      if (latestPrice != null && latestPrice > 0) {
        const todayRow = historyRows.find((r) => parseIsoDate(r.date) === todayUtc);
        await db
          .insert(etfPrices)
          .values({
            etfId: row.id,
            date: todayUtc,
            open: todayRow?.open != null ? String(todayRow.open) : null,
            high: todayRow?.high != null ? String(todayRow.high) : null,
            low: todayRow?.low != null ? String(todayRow.low) : null,
            close: latestPrice.toFixed(4),
            adjClose:
              todayRow?.adjClose != null ? String(todayRow.adjClose) : latestPrice.toFixed(4),
            volume: todayRow?.volume ?? null,
          })
          .onConflictDoUpdate({
            target: [etfPrices.etfId, etfPrices.date],
            set: {
              close: latestPrice.toFixed(4),
              adjClose:
                todayRow?.adjClose != null
                  ? String(todayRow.adjClose)
                  : latestPrice.toFixed(4),
            },
          });
      }

      // ── 9. Upsert dividend history ────────────────────────────────────────
      const dbDivRows = usedEodFallback
        ? buildDividendRowsFromEod(historyRows, row.id)
        : buildDividendRows(divRows, row.id);

      for (const dRow of dbDivRows) {
        await db
          .insert(etfDividends)
          .values(dRow)
          .onConflictDoUpdate({
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

      updated++;
    } catch (err) {
      console.error(`sync-etfs ${row.ticker}`, err);
    }

    // Tiingo free tier: 500 req/hour → ~8.3/min. 200ms delay keeps us well under.
    await sleep(200);
  }

  return Response.json({
    ok: true,
    etfsTouched: updated,
    dividendRowsUpserted: dividendRows,
  });
};
