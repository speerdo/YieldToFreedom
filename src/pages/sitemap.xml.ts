import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';

import { db } from '../lib/db';
import { etfs } from '../lib/db/schema';

export const prerender = false;

const STATIC_PATHS = [
  '/',
  '/about',
  '/etfs',
  '/compare',
  '/stack-builder',
  '/strategy',
  '/strategy/drip',
  '/strategy/margin',
  '/strategy/fi-timeline',
  '/blog',
  '/subscribe/confirmed',
  '/subscribe/invalid',
] as const;

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fullLoc(origin: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin.replace(/\/$/, '')}${p}`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? 'https://yieldtofreedom.com';

  const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((path) => ({
    loc: fullLoc(origin, path),
  }));

  try {
    const rows = await db
      .select({ ticker: etfs.ticker })
      .from(etfs)
      .where(eq(etfs.isActive, true))
      .orderBy(asc(etfs.ticker));
    for (const row of rows) {
      urls.push({ loc: fullLoc(origin, `/etfs/${row.ticker}`) });
    }
  } catch {
    /** Build / runtime without DB still serves static URLs */
  }

  try {
    const posts = await getCollection('blog');
    for (const post of posts) {
      urls.push({
        loc: fullLoc(origin, `/blog/${post.id}`),
        lastmod: post.data.pubDate.toISOString().slice(0, 10),
      });
    }
  } catch {
    /** no-op */
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls
      .map((u) => {
        const lm = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
        return `<url><loc>${escapeXml(u.loc)}</loc>${lm}</url>`;
      })
      .join('') +
    `</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
