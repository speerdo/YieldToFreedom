import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';

import { fmpGet } from '../../../lib/fmp/client';
import { cronAuthorized, cronUnauthorizedResponse } from '../../../lib/http/cron-auth';
import { db } from '../../../lib/db';
import {
  etfDividends,
  etfPrices,
  etfs,
} from '../../../lib/db/schema';

export const prerender = false;

type FmpProfile = Record<string, unknown>;

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 8) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) return null;
  return raw.slice(0, 10);
}

function parseDividendRows(raw: unknown, etfId: number) {
  if (!Array.isArray(raw)) return [];
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

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const exDate =
      parseIsoDate(e.date) ??
      parseIsoDate(e.exDate) ??
      parseIsoDate(e.paymentDate);

    const amount =
      asNumber(e.dividend) ??
      asNumber(e.adjDividend) ??
      asNumber(e.amount) ??
      asNumber(e.value);

    if (!exDate || amount == null) continue;

    const adjAmount = asNumber(e.adjDividend ?? e.adjustedAmount);
    const paymentDate =
      parseIsoDate(e.paymentDate) ?? parseIsoDate(e.paymentDatePaid);
    const recordDate =
      parseIsoDate(e.recordDate) ?? parseIsoDate(e.paymentRecordDate);

    out.push({
      etfId,
      exDate,
      paymentDate,
      declaredDate: parseIsoDate(e.declarationDate),
      recordDate,
      amount: amount.toFixed(6),
      yieldAtPayment: null,
      adjAmount: adjAmount != null ? adjAmount.toFixed(6) : null,
    });

    if (out.length >= 48) break;
  }

  return out
    .sort((a, b) => b.exDate.localeCompare(a.exDate))
    .slice(0, 24);
}

export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request)) return cronUnauthorizedResponse();

  const active = await db.select().from(etfs).where(eq(etfs.isActive, true));

  let updated = 0;
  let dividendRows = 0;

  const todayUtc = new Date().toISOString().slice(0, 10);

  for (const row of active) {
    try {
      const payload = await fmpGet<FmpProfile[] | FmpProfile>('profile', {
        symbol: row.ticker,
      }).catch(() => null);

      const p = payload == null ? null : Array.isArray(payload) ? payload[0] : payload;

      if (p && typeof p === 'object') {
        const price = asNumber(p.price ?? p.previousClose ?? p.open);
        const lastDiv =
          asNumber(p.lastDiv) ?? asNumber((p as { dividend?: unknown }).dividend);
        const mktCap =
          asNumber(p.mktCap) ?? asNumber((p as { marketCap?: unknown }).marketCap);

        let trailingYield: string | undefined;
        if (price != null && price > 0 && lastDiv != null && lastDiv > 0) {
          trailingYield = (lastDiv / price).toFixed(6);
        }

        const erCandidate = asNumber(p.expenseRatio);

        await db
          .update(etfs)
          .set({
            lastPrice:
              price != null && price > 0 ? price.toFixed(4) : (row.lastPrice ?? null),
            lastYield: trailingYield ?? row.lastYield,
            trailing12mYield: trailingYield ?? row.trailing12mYield,
            expenseRatio:
              erCandidate != null ? erCandidate.toFixed(6) : row.expenseRatio,
            aum: mktCap != null ? mktCap.toFixed(2) : row.aum,
            exchange:
              (typeof p.exchangeShortName === 'string' && p.exchangeShortName
                ? p.exchangeShortName
                : typeof p.exchange === 'string'
                  ? p.exchange
                  : null) ?? row.exchange,
            issuer:
              typeof p.companyName === 'string'
                ? p.companyName.slice(0, 100)
                : row.issuer,
            fmpLastSynced: new Date(),
          })
          .where(eq(etfs.id, row.id));

        if (price != null && price > 0) {
          await db
            .insert(etfPrices)
            .values({
              etfId: row.id,
              date: todayUtc,
              open: null,
              high: null,
              low: null,
              close: price.toFixed(4),
              adjClose: null,
              volume: null,
            })
            .onConflictDoUpdate({
              target: [etfPrices.etfId, etfPrices.date],
              set: {
                close: price.toFixed(4),
              },
            });
        }
      }

      let divPayload: unknown;
      try {
        divPayload = await fmpGet('dividends', { symbol: row.ticker });
      } catch {
        divPayload = [];
      }

      const divRows = parseDividendRows(divPayload, row.id);

      for (const dRow of divRows) {
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

    await sleep(200);
  }

  return Response.json({
    ok: true,
    etfsTouched: updated,
    dividendRowsUpserted: dividendRows,
  });
};
