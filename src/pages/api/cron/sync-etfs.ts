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

  // Two-year lookback for dividend history
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const startDate = twoYearsAgo.toISOString().slice(0, 10);
  const todayUtc = new Date().toISOString().slice(0, 10);

  for (const row of active) {
    try {
      // ── 1. Fetch latest EOD price ──────────────────────────────────────────
      let latestPrice: number | null = null;
      let historyRows: TiingoEodRow[] = [];

      try {
        // Fetch 2-year history for both price and dividend extraction
        historyRows = await tiingoPrices(row.ticker, { startDate });
        if (historyRows.length > 0) {
          // Sort newest first; last element is most recent after ascending sort
          const sorted = [...historyRows].sort((a, b) =>
            b.date.localeCompare(a.date),
          );
          latestPrice = asNumber(sorted[0].adjClose ?? sorted[0].close);
        }
      } catch {
        // price fetch failed — skip price update for this ticker
      }

      // ── 2. Fetch meta (name, exchange) ────────────────────────────────────
      let exchangeCode: string | null = null;
      let issuerName: string | null = null;
      try {
        const meta = await tiingoMeta(row.ticker);
        exchangeCode = meta.exchangeCode ?? null;
        issuerName = meta.name ?? null;
      } catch {
        // meta fetch failed — use existing values
      }

      // ── 3. Try dedicated dividends endpoint first ──────────────────────────
      let divRows: TiingoDividendRow[] = [];
      let usedEodFallback = false;
      try {
        divRows = await tiingoDividends(row.ticker, { startDate });
      } catch {
        // Fall back to extracting divCash > 0 from EOD history
        usedEodFallback = true;
      }

      // ── 4. Compute trailing 12m yield ──────────────────────────────────────
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
      const cutoff = twelveMonthsAgo.toISOString().slice(0, 10);

      let trailing12mSum = 0;
      if (divRows.length > 0) {
        for (const d of divRows) {
          const exDate = parseIsoDate(d.exDate);
          if (exDate && exDate >= cutoff) trailing12mSum += asNumber(d.divCash) ?? 0;
        }
      } else if (historyRows.length > 0) {
        for (const r of historyRows) {
          const exDate = parseIsoDate(r.date);
          if (exDate && exDate >= cutoff && r.divCash > 0) trailing12mSum += r.divCash;
        }
      }

      const trailingYield =
        latestPrice != null && latestPrice > 0 && trailing12mSum > 0
          ? (trailing12mSum / latestPrice).toFixed(6)
          : undefined;

      // ── 5. Upsert ETF metrics ──────────────────────────────────────────────
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
          issuer: issuerName ? issuerName.slice(0, 100) : row.issuer,
          dataLastSynced: new Date(),
        })
        .where(eq(etfs.id, row.id));

      // ── 6. Upsert today's EOD price row ───────────────────────────────────
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

      // ── 7. Upsert dividend history ─────────────────────────────────────────
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
