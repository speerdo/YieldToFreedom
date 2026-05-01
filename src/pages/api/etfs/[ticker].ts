import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';

import { db } from '../../../lib/db';
import { etfs } from '../../../lib/db/schema';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) return new Response(JSON.stringify({ error: 'missing_ticker' }), { status: 400 });

  const [row] = await db.select().from(etfs).where(eq(etfs.ticker, ticker)).limit(1);
  if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  return Response.json(row);
};
