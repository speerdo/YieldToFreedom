import type { APIRoute } from 'astro';
import { and, asc, eq, gte } from 'drizzle-orm';

import { computePriceAndTotalReturn } from '../../../../lib/etfs/compute-price-history';
import { db } from '../../../../lib/db';
import { etfDividends, etfPrices, etfs } from '../../../../lib/db/schema';

export const prerender = false;

const RANGE_MONTHS: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '3y': 36,
  '5y': 60,
  '10y': 120,
};

function startDateForRange(range: string | null): string | null {
  if (!range || range === 'max') return null;
  const months = RANGE_MONTHS[range.toLowerCase()];
  if (!months) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ params, url }) => {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) return new Response(JSON.stringify({ error: 'missing_ticker' }), { status: 400 });

  const [etf] = await db.select().from(etfs).where(eq(etfs.ticker, ticker)).limit(1);
  if (!etf) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  const startDate = startDateForRange(url.searchParams.get('range'));
  const priceFilters = [eq(etfPrices.etfId, etf.id)];
  const dividendFilters = [eq(etfDividends.etfId, etf.id)];
  if (startDate) {
    priceFilters.push(gte(etfPrices.date, startDate));
    dividendFilters.push(gte(etfDividends.exDate, startDate));
  }

  const prices = await db
    .select({ date: etfPrices.date, close: etfPrices.close, adjClose: etfPrices.adjClose })
    .from(etfPrices)
    .where(and(...priceFilters))
    .orderBy(asc(etfPrices.date));

  const dividends = await db
    .select({ exDate: etfDividends.exDate, amount: etfDividends.amount })
    .from(etfDividends)
    .where(and(...dividendFilters))
    .orderBy(asc(etfDividends.exDate));

  const { pricePoints, totalReturnPoints } = computePriceAndTotalReturn(
    prices.map((p) => ({
      date: String(p.date),
      close: String(p.close),
      adjClose: p.adjClose != null ? String(p.adjClose) : null,
    })),
    dividends.map((d) => ({ exDate: String(d.exDate), amount: String(d.amount) })),
  );

  return Response.json({ ticker, pricePoints, totalReturnPoints });
};
