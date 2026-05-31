import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';

import { computePriceAndTotalReturn } from '../../../../lib/etfs/compute-price-history';
import { db } from '../../../../lib/db';
import { etfDividends, etfPrices, etfs } from '../../../../lib/db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) return new Response(JSON.stringify({ error: 'missing_ticker' }), { status: 400 });

  const [etf] = await db.select().from(etfs).where(eq(etfs.ticker, ticker)).limit(1);
  if (!etf) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  const prices = await db
    .select({ date: etfPrices.date, close: etfPrices.close })
    .from(etfPrices)
    .where(eq(etfPrices.etfId, etf.id))
    .orderBy(asc(etfPrices.date));

  const dividends = await db
    .select({ exDate: etfDividends.exDate, amount: etfDividends.amount })
    .from(etfDividends)
    .where(eq(etfDividends.etfId, etf.id))
    .orderBy(asc(etfDividends.exDate));

  const { pricePoints, totalReturnPoints } = computePriceAndTotalReturn(
    prices.map((p) => ({ date: String(p.date), close: String(p.close) })),
    dividends.map((d) => ({ exDate: String(d.exDate), amount: String(d.amount) })),
  );

  return Response.json({ ticker, pricePoints, totalReturnPoints });
};
