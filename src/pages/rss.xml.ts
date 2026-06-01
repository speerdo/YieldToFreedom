import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const prerender = true;

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.origin ?? 'https://yieldtofreedom.com').replace(/\/$/, '');

  const posts = (await getCollection('blog'))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const items = posts
    .map((post) => {
      const url = `${origin}/blog/${post.id}`;
      const pubDate = post.data.pubDate.toUTCString();
      const image = post.data.image
        ? `<enclosure url="${escapeXml(post.data.image)}" type="image/jpeg" length="0" />`
        : '';
      return `
    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(post.data.description)}</description>
      <pubDate>${pubDate}</pubDate>
      ${image}
    </item>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Yield to Freedom — Income ETF Research</title>
    <link>${origin}</link>
    <description>Research, strategy guides, and tools for income-focused ETF investors.</description>
    <language>en-us</language>
    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${origin}/og-default.png</url>
      <title>Yield to Freedom</title>
      <link>${origin}</link>
    </image>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
