import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';

import {
  computeTrailingYieldTrail,
} from '../../../../lib/etfs/compute-trailing-yield-trail';
import { db } from '../../../../lib/db';
import { etfDividends, etfPrices, etfs } from '../../../../lib/db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) return new Response(JSON.stringify({ error: 'missing_ticker' }), { status: 400 });

  const [etf] = await db.select().from(etfs).where(eq(etfs.ticker, ticker)).limit(1);
  if (!etf) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  const dividends = await db
    .select({ exDate: etfDividends.exDate, amount: etfDividends.amount })
    .from(etfDividends)
    .where(eq(etfDividends.etfId, etf.id))
    .orderBy(desc(etfDividends.exDate))
    .limit(96);

  const prices = await db
    .select({ date: etfPrices.date, close: etfPrices.close })
    .from(etfPrices)
    .where(eq(etfPrices.etfId, etf.id))
    .orderBy(desc(etfPrices.date))
    .limit(800);

  const pricesAsc = [...prices]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: String(r.date), close: String(r.close) }));

  const lastPx = Number(etf.lastPrice);
  const fb = Number.isFinite(lastPx) && lastPx > 0 ? lastPx : null;

  const points = computeTrailingYieldTrail(
    dividends.map((d) => ({ exDate: String(d.exDate), amount: String(d.amount) })),
    pricesAsc,
    fb,
  );

  return Response.json({
    ticker: etf.ticker,
    fmpLastSynced: etf.fmpLastSynced ?? null,
    points,
  });
};
