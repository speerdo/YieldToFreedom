import type { APIRoute } from 'astro';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../../lib/db';
import { etfs } from '../../../lib/db/schema';

export const prerender = false;

const SORTABLE = {
  ytfScore: etfs.ytfScore,
  lastYield: etfs.lastYield,
  trailing12mYield: etfs.trailing12mYield,
  expenseRatio: etfs.expenseRatio,
  aum: etfs.aum,
  ticker: etfs.ticker,
  name: etfs.name,
  pillar: etfs.pillar,
} as const;

export const GET: APIRoute = async ({ url }) => {
  const pillar = url.searchParams.get('pillar');
  const grade = url.searchParams.get('grade');
  const freq = url.searchParams.get('frequency');
  const minYield = parseFloat(url.searchParams.get('minYield') ?? '0');
  const maxEr = parseFloat(url.searchParams.get('maxEr') ?? '999');
  const sort = url.searchParams.get('sort') ?? 'ytfScore';
  const dir = url.searchParams.get('dir') ?? 'desc';

  const filters = [eq(etfs.isActive, true)];
  if (pillar && pillar !== 'all') filters.push(eq(etfs.pillar, pillar));
  if (grade && grade !== 'all') filters.push(eq(etfs.ytfGrade, grade));
  if (freq && freq !== 'all') filters.push(eq(etfs.dividendFrequency, freq));
  if (minYield > 0)
    filters.push(gte(etfs.trailing12mYield, String(minYield / 100)));
  if (maxEr < 999) filters.push(lte(etfs.expenseRatio, String(maxEr / 100)));

  const column =
    sort in SORTABLE ? SORTABLE[sort as keyof typeof SORTABLE] : etfs.ytfScore;

  const orderByClause = dir === 'asc' ? asc(column) : desc(column);

  const results = await db
    .select()
    .from(etfs)
    .where(and(...filters))
    .orderBy(orderByClause)
    .limit(100);

  return Response.json(results);
};
