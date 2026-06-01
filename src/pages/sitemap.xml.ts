import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';

import { db } from '../lib/db';
import { etfs } from '../lib/db/schema';

export const prerender = false;

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

const STATIC_PATHS: SitemapEntry[] = [
  { loc: '/',                       changefreq: 'daily',   priority: 1.0 },
  { loc: '/etfs',                   changefreq: 'daily',   priority: 0.9 },
  { loc: '/blog',                   changefreq: 'weekly',  priority: 0.8 },
  { loc: '/strategy',               changefreq: 'monthly', priority: 0.8 },
  { loc: '/strategy/drip',          changefreq: 'monthly', priority: 0.7 },
  { loc: '/strategy/margin',        changefreq: 'monthly', priority: 0.7 },
  { loc: '/strategy/fi-timeline',   changefreq: 'monthly', priority: 0.7 },
  { loc: '/compare',                changefreq: 'weekly',  priority: 0.7 },
  { loc: '/stack-builder',          changefreq: 'weekly',  priority: 0.7 },
  { loc: '/about',                  changefreq: 'yearly',  priority: 0.4 },
  { loc: '/privacy',                changefreq: 'yearly',  priority: 0.2 },
  { loc: '/terms',                  changefreq: 'yearly',  priority: 0.2 },
];

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fullLoc(origin: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin.replace(/\/$/, '')}${p}`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? 'https://yieldtofreedom.com';

  const urls: SitemapEntry[] = STATIC_PATHS.map((entry) => ({
    ...entry,
    loc: fullLoc(origin, entry.loc),
  }));

  try {
    const rows = await db
      .select({ ticker: etfs.ticker, dataLastSynced: etfs.dataLastSynced })
      .from(etfs)
      .where(eq(etfs.isActive, true))
      .orderBy(asc(etfs.ticker));
    for (const row of rows) {
      urls.push({
        loc: fullLoc(origin, `/etfs/${row.ticker}`),
        lastmod: row.dataLastSynced
          ? (row.dataLastSynced instanceof Date ? row.dataLastSynced : new Date(String(row.dataLastSynced)))
              .toISOString()
              .slice(0, 10)
          : undefined,
        changefreq: 'daily',
        priority: 0.6,
      });
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
        changefreq: 'monthly',
        priority: 0.7,
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
        const lm  = u.lastmod    ? `<lastmod>${u.lastmod}</lastmod>`         : '';
        const cf  = u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : '';
        const pri = u.priority   !== undefined ? `<priority>${u.priority.toFixed(1)}</priority>` : '';
        return `<url><loc>${escapeXml(u.loc)}</loc>${lm}${cf}${pri}</url>`;
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
