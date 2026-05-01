# Yield to Freedom — Action Plan

**Project:** yieldtofreedom.com  
**Entity:** Creative Bandit LLC  
**Updated:** May 2026  

This is the step-by-step build plan. Each sprint maps to 1–3 weeks of part-time work (~5–10 hrs/week alongside contract work). Complete tasks in order — later sprints depend on earlier ones.

**How to track progress:** Mark checklist items with `[x]` when done; leave `[ ]` until finished. Update the *last progress update* line whenever you check something in.

*Last progress update: 2026-05-06 — **Sprint 4 tools:** **`/compare`** (URL `?a&b&c`, Alpine, TTM dividend-yield curves via **`GET /api/etfs/[ticker]/yield-trail`**), **`/stack-builder`** (baked Neon snapshot, allocations, pillar doughnut). **`/etf/[t]`** links to Compare. Nav + **`.env.example`** (Resend + `PUBLIC_SITE_URL`). Todo: plug **CRON_SECRET** / **Resend** on Vercel; **`npm run db:migrate`** for subscribe token if DB not migrated.*

---

## Sprint status tracker

### Sprint 1 — Foundation

| Step | Done |
|------|------|
| 1.1 Initialize project | [x] |
| 1.2 Install dependencies | [x] |
| 1.3 Configure Astro (Vercel, Clerk, Tailwind) | [x] |
| 1.4 Neon + Drizzle | [x] |
| 1.5 FMP client (`src/lib/fmp/client.ts`, `/stable/`) | [x] user-tested key |
| 1.6 Seed ETFs (`npm run seed:etfs`) | [x] |
| 1.7 Vercel dashboard + env vars + preview branch | [ ] (`vercel.json` [x]) |
| 1.8 `.gitignore` | [x] |

### Sprint 2 — ETF directory

| Step | Done |
|------|------|
| 2.1 Base layout (`Base`, `Header`, `Footer`, `Seo`) | [x] |
| 2.2 Shared UI chips | [x] |
| 2.3 `/etfs/[ticker]` (+JSON-LD, disclaimer, related) | [x] |
| 2.4 `GET /api/etfs` (+ `GET /api/etfs/[ticker]`) | [x] |
| 2.5 Grader SPEC §11 + `npm run run-grader` | [x] |
| 2.6 Dividend chart (Chart.js) | [x] |
| 2.7 Cron **`/api/cron/sync-etfs`** + **`/api/cron/grade-etfs`** | [x] code ([ ] nightly smoke 5 tickers) |

### Sprint 3 — Strategy & capture

| Step | Done |
|------|------|
| 3.1 Homepage (hero, pillars, spotlight, capture, footer links) | [x] |
| 3.2 `POST /api/subscribe` + confirm flow + Neon column | [x] |
| 3.3 Strategy `/strategy` + drip / margin / FI timeline (+ Article JSON-LD) | [x] |
| 3.4 About `/about` | [x] |

### Sprint 4 — Tools

| Step | Done |
|------|------|
| 4.1 Compare `/compare` (+ **`/api/etfs/[ticker]/yield-trail`**) | [x] |
| 4.2 Stack Builder `/stack-builder` | [x] |

---

> **Tailwind note:** Astro 6 / Vite 7: use **Tailwind v4 via PostCSS** (`@tailwindcss/postcss`, `postcss.config.mjs`), not `@tailwindcss/vite`, until that plugin supports the current Vite resolver.
>
> **Astro server routes:** Astro 6 removed **`output: 'hybrid'`** — **default static** still emits serverless bundles via **`@astrojs/vercel`** when routes declare **`export const prerender = false`**.

---

## Pre-Work Checklist (Before Any Code)

These are long-lead-time items. Start all of them before Sprint 1 coding.

- [ ] **Register `yieldtofreedom.com`** — point nameservers to Vercel immediately
- [ ] **Contact FMP for Commercial Agreement** — go to `financialmodelingprep.com` and request a Data Display and Licensing Agreement for their Build tier (~$79/mo). This is the longest lead-time item in the project. Do not display FMP data publicly without this signed.
- [ ] **Interim data source decision** — consider Twelve Data ($29/mo, display-permissive) for Phase 1 development while FMP agreement is being negotiated. The `src/lib/fmp/client.ts` wrapper can swap providers with minimal changes.
- [ ] **Set up email addresses** — configure `hello@yieldtofreedom.com` and `alerts@yieldtofreedom.com` in Resend
- [ ] **Create accounts** (if not already done): Neon, Vercel, Clerk, Stripe, Resend, Loops.so, SnapTrade

---

## Sprint 1 — Foundation (Weeks 1–2)

**Goal:** Working project scaffold deployed to Vercel, DB running, FMP client tested.

### 1.1 Initialize Project

```bash
npm create astro@latest yield-to-freedom -- \
  --template minimal \
  --typescript strict \
  --no-install \
  --no-git

cd yield-to-freedom
npm install
```

### 1.2 Install All Dependencies

```bash
# Core
npm install astro@6.2.1 @astrojs/vercel@10.0.6 typescript@6.0.3

# Database
npm install drizzle-orm@0.45.2 @neondatabase/serverless@1.1.0
npm install -D drizzle-kit@0.31.10

# Styling (Tailwind v4 — PostCSS in this repo; see note under Sprint 1 table)
npm install tailwindcss@4.2.4 @tailwindcss/postcss@4.2.4 postcss

# Auth
npm install @clerk/astro@3.1.0

# Payments
npm install stripe@22.1.0

# Email
npm install resend@6.12.2

# Charts & UI
npm install chart.js@4.5.1 alpinejs@3.15.12

# Phase 2 (brokerage)
npm install snaptrade-typescript-sdk@9.0.191

# Dev
npm install -D @astrojs/check@0.9.9 tsx
```

### 1.3 Configure Astro

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

export default defineConfig({
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true },
    edgeMiddleware: true,
  }),
  integrations: [clerk()],
});
```

```css
/* src/styles/global.css */
@import "tailwindcss";
```

```json
// tsconfig.json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

### 1.4 Set Up Neon DB

1. Create Neon project at `console.neon.tech`
2. Create a `dev` branch from `main` in the Neon console
3. Copy the connection strings (pooled) for both branches to `.env`

```typescript
// drizzle.config.ts — repo also calls `import 'dotenv/config'` and accepts
// DATABASE_URL or NEON_DATABASE_CONNECTION_STRING
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_CONNECTION_STRING;

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: url! },
});
```

```typescript
// src/lib/db/index.ts — resolves URL from import.meta.env (Astro) or process.env (scripts)
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// see repo for resolveDatabaseUrl() + export const db = drizzle(...)
```

5. Write the full schema in `src/lib/db/schema.ts` (copy from SPEC.md Section 5 — **committed**)
6. Generate and apply first migration:

```bash
npm run db:generate
npm run db:migrate
```

### 1.5 Build FMP Client

```typescript
// src/lib/fmp/client.ts
const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const FMP_KEY = import.meta.env.FMP_API_KEY;

export async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FMP_BASE}${path}`);
  url.searchParams.set('apikey', FMP_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FMP ${path} → ${res.status}`);
  return res.json();
}
```

Test against 5 tickers manually before seeding.

### 1.6 Seed ETF Universe

```typescript
// scripts/seed-etfs.ts
import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';

const ETF_UNIVERSE = [
  // Income pillar
  { ticker: 'JEPI',  name: 'JPMorgan Equity Premium Income ETF',   pillar: 'income',    category: 'covered-call' },
  { ticker: 'JEPQ',  name: 'JPMorgan Nasdaq Equity Premium ETF',   pillar: 'income',    category: 'covered-call' },
  { ticker: 'DIVO',  name: 'Amplify CWP Enhanced Dividend ETF',    pillar: 'income',    category: 'covered-call' },
  { ticker: 'QYLD',  name: 'Global X NASDAQ 100 Covered Call ETF', pillar: 'income',    category: 'covered-call' },
  { ticker: 'XYLD',  name: 'Global X S&P 500 Covered Call ETF',    pillar: 'income',    category: 'covered-call' },
  { ticker: 'RYLD',  name: 'Global X Russell 2000 Covered Call',   pillar: 'income',    category: 'covered-call' },
  { ticker: 'SVOL',  name: 'Simplify Volatility Premium ETF',      pillar: 'income',    category: 'high-yield' },
  { ticker: 'SPYI',  name: 'NEOS S&P 500 High Income ETF',         pillar: 'income',    category: 'covered-call' },
  { ticker: 'FEPI',  name: 'REX FANG & Innovation Equity ETF',     pillar: 'income',    category: 'covered-call' },
  { ticker: 'PBDC',  name: 'Putnam BDC Income ETF',                pillar: 'income',    category: 'high-yield' },
  { ticker: 'CSHI',  name: 'NEOS Enhanced Income Cash Alternative', pillar: 'income',   category: 'high-yield' },
  { ticker: 'GPIQ',  name: 'Goldman Sachs Nasdaq 100 Core Premium', pillar: 'income',   category: 'covered-call' },
  { ticker: 'TOPW',  name: 'Tidal ETF Trust',                      pillar: 'income',    category: 'high-yield' },
  { ticker: 'GOOW',  name: 'GOOW ETF',                             pillar: 'income',    category: 'high-yield' },
  { ticker: 'NVII',  name: 'NorthStar Income ETF',                  pillar: 'income',   category: 'high-yield' },
  { ticker: 'IDVO',  name: 'Amplify International Div Income ETF', pillar: 'income',    category: 'dividend-growth' },
  { ticker: 'QDVO',  name: 'Amplify Dividend Income ETF',          pillar: 'income',    category: 'dividend-growth' },
  // Stability pillar
  { ticker: 'SCHD',  name: 'Schwab US Dividend Equity ETF',        pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'VIG',   name: 'Vanguard Dividend Appreciation ETF',   pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'HDV',   name: 'iShares Core High Dividend ETF',       pillar: 'stability', category: 'high-yield' },
  { ticker: 'DVY',   name: 'iShares Select Dividend ETF',          pillar: 'stability', category: 'high-yield' },
  { ticker: 'SDY',   name: 'SPDR S&P Dividend ETF',               pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'DGRO',  name: 'iShares Core Dividend Growth ETF',     pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'NOBL',  name: 'ProShares S&P 500 Dividend Aristocrats', pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'VYM',   name: 'Vanguard High Dividend Yield ETF',     pillar: 'stability', category: 'high-yield' },
  // Growth pillar
  { ticker: 'VOO',   name: 'Vanguard S&P 500 ETF',                 pillar: 'growth',    category: 'total-return' },
  { ticker: 'SCHG',  name: 'Schwab US Large-Cap Growth ETF',       pillar: 'growth',    category: 'total-return' },
  { ticker: 'QQQ',   name: 'Invesco QQQ Trust',                    pillar: 'growth',    category: 'total-return' },
  { ticker: 'VGT',   name: 'Vanguard Information Technology ETF',  pillar: 'growth',    category: 'total-return' },
  { ticker: 'IBIT',  name: 'iShares Bitcoin Trust ETF',            pillar: 'growth',    category: 'total-return' },
  { ticker: 'FBTC',  name: 'Fidelity Wise Origin Bitcoin Fund',    pillar: 'growth',    category: 'total-return' },
];

for (const etf of ETF_UNIVERSE) {
  await db.insert(etfs).values(etf).onConflictDoNothing({ target: etfs.ticker });
  console.log(`Seeded ${etf.ticker}`);
}
```

Seed loads `.env` via `import 'dotenv/config'` (`tsx`).

```bash
npm run seed:etfs
```

### 1.7 Set Up Vercel

1. Create Vercel project, connect GitHub repo
2. Set all env vars in Vercel dashboard (copy from `.env.example`)
3. Set production branch to `main`, preview branch to `develop`
4. **Repo:** `[x]` `vercel.json` with cron config (SPEC § Vercel) — wire dashboard when cron routes exist

### 1.8 Configure .gitignore

- [x] Done in repo (includes Vercel local output).

```
.env
.env.local
node_modules/
dist/
.vercel/
.astro/
```

### Sprint 1 Completion Criteria

- [x] `npm run dev` runs without errors
- [x] `npm run build` succeeds
- [x] DB schema applied to dev Neon branch *(first migration pushed to linked DB — confirm branch in Neon UI)*
- [x] 5 ETFs seeded and queryable *(full universe seeded; re-run safe via `ON CONFLICT DO NOTHING`)*
- [x] FMP client returns valid data for JEPI, SCHD, VOO *(user verified API via key smoke test)*
- [ ] Preview deployment live on Vercel
- [ ] FMP commercial agreement conversation started

---

## Sprint 2 — ETF Directory (Weeks 3–5)

**Goal:** `/etfs` screener and `/etfs/[ticker]` profile pages live and SEO-ready.

### 2.1 Base Layout

```astro
<!-- src/layouts/Base.astro -->
---
import Seo from '../components/layout/Seo.astro';
import Header from '../components/layout/Header.astro';
import Footer from '../components/layout/Footer.astro';
interface Props { title: string; description: string; schema?: object; }
const { title, description, schema } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/src/styles/global.css" />
  <Seo {title} {description} {schema} />
</head>
<body>
  <Header />
  <main><slot /></main>
  <Footer />
</body>
</html>
```

### 2.2 Shared UI Components

Build these components (no logic, pure display):
- `GradeChip.astro` — renders A/B/C/D with color (green/blue/yellow/red)
- `Badge.astro` — pill badge for pillar labels
- `Card.astro` — wrapper with border/shadow
- `Disclaimer.astro` — financial disclaimer text block

### 2.3 ETF Profile Pages (Static)

```typescript
// src/pages/etfs/[ticker].astro
---
import { db } from '../../lib/db';
import { etfs, etfDividends } from '../../lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Base from '../../layouts/Base.astro';
import DividendChart from '../../components/etf/DividendChart.astro';
import GradeChip from '../../components/ui/GradeChip.astro';
import Disclaimer from '../../components/ui/Disclaimer.astro';

export async function getStaticPaths() {
  const all = await db.select({ ticker: etfs.ticker })
    .from(etfs).where(eq(etfs.isActive, true));
  return all.map(({ ticker }) => ({ params: { ticker } }));
}

const { ticker } = Astro.params;
const [etf] = await db.select().from(etfs)
  .where(eq(etfs.ticker, ticker.toUpperCase())).limit(1);

if (!etf) return Astro.redirect('/etfs');

const dividends = await db.select().from(etfDividends)
  .where(eq(etfDividends.etfId, etf.id))
  .orderBy(desc(etfDividends.exDate)).limit(48);

const schema = {
  "@context": "https://schema.org",
  "@type": "FinancialProduct",
  "name": etf.name,
  "description": `${etf.name} (${etf.ticker}) — income ETF research and analysis`,
};

export const headers = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
};
---
<Base title={`${etf.ticker} ETF — ${etf.name}`} description={`...`} {schema}>
  <!-- ETF profile content -->
  <Disclaimer />
</Base>
```

### 2.4 ETF Screener API

```typescript
// src/pages/api/etfs/index.ts
import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { etfs } from '../../../lib/db/schema';
import { eq, gte, lte, and, asc, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url }) => {
  const pillar    = url.searchParams.get('pillar');
  const grade     = url.searchParams.get('grade');
  const freq      = url.searchParams.get('frequency');
  const minYield  = parseFloat(url.searchParams.get('minYield') ?? '0');
  const maxEr     = parseFloat(url.searchParams.get('maxEr') ?? '999');
  const sort      = url.searchParams.get('sort') ?? 'ytfScore';
  const dir       = url.searchParams.get('dir') ?? 'desc';

  const filters = [eq(etfs.isActive, true)];
  if (pillar && pillar !== 'all') filters.push(eq(etfs.pillar, pillar));
  if (grade && grade !== 'all')   filters.push(eq(etfs.ytfGrade, grade));
  if (freq && freq !== 'all')     filters.push(eq(etfs.dividendFrequency, freq));
  if (minYield > 0) filters.push(gte(etfs.trailing12mYield, String(minYield / 100)));
  if (maxEr < 999)  filters.push(lte(etfs.expenseRatio, String(maxEr / 100)));

  const column = etfs[sort as keyof typeof etfs] ?? etfs.ytfScore;
  const results = await db.select().from(etfs)
    .where(and(...filters))
    .orderBy(dir === 'asc' ? asc(column as any) : desc(column as any))
    .limit(100);

  return Response.json(results);
};
```

### 2.5 Grade Algorithm

Implement `calculateYtfGrade` in `src/lib/grader/grade.ts` (full implementation in SPEC.md Section 11).

Run the grader against the full seeded universe:
```bash
npm run run-grader
# or: DATABASE_URL=... npx tsx scripts/run-grader.ts
```

### 2.6 DividendChart Component

Use Chart.js with `client:load`. Chart type: bar chart, x-axis = ex-date, y-axis = dividend amount per share.

### 2.7 Nightly Sync Cron

Implement `src/pages/api/cron/sync-etfs.ts`:
1. Verify `CRON_SECRET` bearer token
2. For each active ETF: fetch FMP profile, upsert metrics, upsert dividends, upsert EOD prices
3. Rate limit: `await new Promise(r => setTimeout(r, 200))` between tickers

Test locally:
```bash
npx tsx -e "import('./src/pages/api/cron/sync-etfs.ts')"
```

### Sprint 2 Completion Criteria

- [x] `/etfs` loads with full ETF list *(DB snapshot at build/prerender)*
- [x] Screener filters work (pillar, grade, frequency + search + sort)
- [x] `/etfs/JEPI` renders *(dividend chart shows data after sync; otherwise empty-state copy)*
- [x] ETF pages carry `FinancialProduct` JSON-LD
- [x] Disclaimer block on profile pages
- [x] Grade algorithm run on entire **seeded** universe (`npm run run-grader`; expand list for “~75 ETFs” plan)
- [ ] Nightly sync tested against **5 tickers** *(call `GET /api/cron/sync-etfs` with `Authorization: Bearer $CRON_SECRET` in preview)*

---

## Sprint 3 — Strategy Content (Weeks 6–7)

**Goal:** Homepage, strategy pages, and email capture live.

### 3.1 Homepage

Sections to build:
1. **Hero** — headline ("Build Income. Reach Freedom."), subhead, CTA buttons
2. **Pillar explainer** — three-column layout: Income / Stability / Growth with brief description and 2–3 example ETFs each
3. **Top-rated ETFs** — one A-grade ETF from each pillar with grade chip and key metric
4. **Email capture** — "Get the free Income ETF Starter Guide" → double opt-in flow
5. **Footer** — links, disclaimer

JSON-LD: `WebSite` + `Organization`

### 3.2 Email Capture API

```typescript
// src/pages/api/subscribe.ts
export const POST: APIRoute = async ({ request }) => {
  const { email, source } = await request.json();
  await db.insert(emailSubscribers).values({ email, source }).onConflictDoNothing();
  // Send double opt-in email via Resend
  const resend = new Resend(import.meta.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'hello@yieldtofreedom.com',
    to: email,
    subject: 'Confirm your Yield to Freedom subscription',
    html: `<p>Click <a href="${confirmUrl}">here</a> to confirm.</p>`,
  });
  return Response.json({ ok: true });
};
```

### 3.3 Strategy Pages

Build four pages with Article JSON-LD:
- `/strategy/index.astro` — overview + links
- `/strategy/drip.astro` — DRIP mechanics, compounding examples
- `/strategy/margin.astro` — margin arbitrage, risk disclosure
- `/strategy/fi-timeline.astro` — FI Score concept

Each page links to 3–5 relevant ETF profiles.

### 3.4 About Page

- Philosophy: income-first investing, the 40/30/30 pillar framework
- Creator background (brief)
- Full financial disclaimer
- Link to methodology page (future sprint)

### Sprint 3 Completion Criteria

- [x] Homepage renders with hero, pillar explainer, email capture
- [x] Email capture POSTs to `/api/subscribe` (**Resend sends when `RESEND_API_KEY`** is set — otherwise `{ emailSent:false }`)
- [x] All four strategy pages live with Article schema
- [x] About page live
- [x] All public routes above ship unique `<title>` + `<meta description>` *(spot-check periodically for drift)*

---

## Sprint 4 — Tools (Weeks 8–9)

**Goal:** Compare tool and Stack Builder live (no auth required).

### 4.1 Compare Tool (`/compare`)

- URL state: `?a=JEPI&b=SCHD&c=VOO`
- On page load: read params, fetch ETF data from `/api/etfs/[ticker]` for each
- Comparison grid: all key metrics side-by-side
- Chart.js overlay: trailing yield over last 12 months
- Add/remove ETF selector (Alpine.js for reactivity)
- No auth required

### 4.2 Stack Builder (`/stack-builder`)

ETF data baked into page at build time (no client fetch):

```astro
---
const etfData = await db.select({
  ticker: etfs.ticker, name: etfs.name, pillar: etfs.pillar,
  trailing12mYield: etfs.trailing12mYield,
  dividendFrequency: etfs.dividendFrequency,
  ytfGrade: etfs.ytfGrade, lastPrice: etfs.lastPrice,
}).from(etfs).where(eq(etfs.isActive, true));
---
<script define:vars={{ etfData }}>
  // Client-side calculator logic
  // User selects ETFs + allocation % + investment amount
  // Output: projected monthly income, pillar pie chart (Chart.js)
</script>
```

### Sprint 4 Completion Criteria

- [x] Compare tool works with 2–3 ETFs via URL params
- [x] Stack Builder calculates monthly income projection
- [x] Pillar balance pie chart renders in Stack Builder
- [x] Both tools mobile-responsive

---

## Sprint 5 — Blog & SEO (Weeks 10–11)

**Goal:** Blog running, SEO infrastructure complete, ready for AdSense application.

### 5.1 Blog Setup

Use Astro content collections:

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';
export const collections = {
  blog: defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.date(),
      tags: z.array(z.string()).optional(),
      relatedEtfs: z.array(z.string()).optional(),
    }),
  }),
};
```

### 5.2 First 6 Posts (Targets for launch)

1. "What Is JEPI? The Covered Call ETF Explained"
2. "SCHD vs JEPI: Which Income ETF Is Right For You?"
3. "JEPI vs JEPQ: Comparing JPMorgan's Premium Income ETFs"
4. "Building the 40/30/30 Income Portfolio"
5. "What Is DRIP and Why It Matters for Income Investors"
6. "High-Yield ETFs Ranked: Our A-to-D Grading System Explained"

Each post links internally to relevant ETF profiles and strategy pages.

### 5.3 XML Sitemap

```typescript
// src/pages/sitemap.xml.ts
import { db } from '../lib/db';
import { etfs } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const allEtfs = await db.select({ ticker: etfs.ticker }).from(etfs).where(eq(etfs.isActive, true));
  const etfUrls = allEtfs.map(e => `<url><loc>https://yieldtofreedom.com/etfs/${e.ticker}</loc></url>`);
  // Add static pages, blog posts
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset ...>${etfUrls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
```

### 5.4 Analytics & Monetization Setup

- [ ] Connect Google Search Console
- [ ] Add Google Analytics 4 or Plausible (script in `Base.astro`)
- [ ] Submit AdSense application (requires site to have substantial content)

### Sprint 5 Completion Criteria

- [ ] Blog listing and post pages render
- [ ] 6 launch posts written and published
- [ ] XML sitemap generates all ETF URLs + static pages
- [ ] robots.txt in place
- [ ] Analytics script installed
- [ ] AdSense application submitted

---

## Sprint 6 — Phase 1 Soft Launch (Week 12)

**Goal:** Publicly launch Phase 1 to early adopters and communities.

### 6.1 Launch Checklist

**Technical:**
- [ ] Lighthouse audit on homepage, ETF page, screener — target 90+ all metrics
- [ ] Mobile responsiveness pass on all pages (test at 375px, 768px, 1280px)
- [ ] Accessibility audit — keyboard navigation, color contrast, alt text
- [ ] `npm run build` runs clean with zero TypeScript errors
- [ ] Nightly cron tested end-to-end in production (verify Vercel cron fires, check logs)
- [ ] Load test `/api/etfs` with 50 concurrent requests

**Content:**
- [ ] Disclaimer visible on all ETF and strategy pages
- [ ] "Data as of [date]" label on all ETF metric displays
- [ ] FMP licensing agreement signed (block public launch if not)
- [ ] Privacy policy page live (`/privacy`)
- [ ] Terms of service page live (`/terms`)

**Distribution:**
- [ ] Launch post: r/dividends
- [ ] Launch post: r/financialindependence
- [ ] Launch post: r/ETFs
- [ ] LinkedIn announcement
- [ ] Twitter/X announcement

---

## Sprint 7 — Phase 2 Foundation (Weeks 13–15)

**Goal:** Auth, payments, and basic app dashboard working end-to-end.

### 7.1 Clerk Integration

Add Clerk integration to `astro.config.mjs` (already installed in Sprint 1). Configure:
- `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in env vars
- Clerk dashboard: set redirect URLs, webhook endpoint (`/api/auth/sync-user`)

Create `src/middleware.ts` (see SPEC.md Section 9).

```astro
<!-- src/pages/login.astro -->
---
export const prerender = false;
import { SignIn } from '@clerk/astro/components';
---
<SignIn />
```

### 7.2 App Layout

```astro
<!-- src/layouts/App.astro -->
---
export const prerender = false;
import { UserButton } from '@clerk/astro/components';
---
<html>
  <body>
    <nav><!-- sidebar nav for /app/* routes --></nav>
    <main><slot /></main>
  </body>
</html>
```

All `src/pages/app/*.astro` files declare `export const prerender = false` at the top.

### 7.3 Stripe Setup

1. Create products and prices in Stripe dashboard (see SPEC.md Section 12)
2. Copy price IDs to env vars
3. Implement `/api/stripe/checkout.ts` and `/api/stripe/webhook.ts`
4. Test webhook locally with Stripe CLI: `stripe listen --forward-to localhost:4321/api/stripe/webhook`

### 7.4 App Dashboard (Basic)

`/app/index.astro`:
- Query user holdings (manual entry only at this stage)
- Display: portfolio value, monthly income, pillar breakdown pie chart (Chart.js)
- Free tier cap: 5 holdings max (enforce in API, not just UI)
- Upgrade CTA for premium features (blurred overlay with lock icon)

### Sprint 7 Completion Criteria

- [ ] `/login` renders Clerk sign-in form
- [ ] `/app` redirects to login if no session
- [ ] `users` table populated on first sign-in via Clerk webhook
- [ ] Stripe checkout creates session and redirects to Stripe
- [ ] Stripe webhook correctly sets `subscription_tier = 'pro'` on success
- [ ] Basic dashboard renders holdings and pillar chart
- [ ] Free-tier 5-holding limit enforced

---

## Sprint 8 — Phase 2 Portfolio (Weeks 16–18)

**Goal:** Brokerage import, full portfolio view, DRIP modeler.

### 8.1 SnapTrade Integration

```typescript
// src/lib/snaptrade/client.ts
import { SnapTrade } from 'snaptrade-typescript-sdk';

export const snaptrade = new SnapTrade({
  clientId: import.meta.env.SNAPTRADE_CLIENT_ID,
  consumerKey: import.meta.env.SNAPTRADE_CONSUMER_KEY,
});
```

Implement the OAuth flow (see SPEC.md Section 5.2):
- `POST /api/brokerage/connect` — register SnapTrade user, generate portal URL
- `GET /api/brokerage/callback` — receive redirect, trigger portfolio sync
- `POST /api/portfolio/sync` — fetch holdings, match to `etfs` table, upsert `user_holdings`

> Store `snaptradeUserSecret` in encrypted session or derive per-request via HMAC — never in DB plaintext.

### 8.2 Portfolio Page (`/app/portfolio`)

- Full holdings table from brokerage + manual entries
- Pillar allocation vs. target allocation (from user settings)
- Gap analysis: which pillar is over/under target by what %
- Rebalancing suggestions

### 8.3 FI Score

Implement `computeFiScore` in `src/lib/utils/finance.ts`:
```typescript
export function computeFiScore(monthlyIncome: number, monthlyExpenseTarget: number): number {
  if (!monthlyExpenseTarget) return 0;
  return Math.min(100, (monthlyIncome / monthlyExpenseTarget) * 100);
}
```

Display as a progress bar on the dashboard.

### 8.4 DRIP Modeler (`/app/drip`)

Implement `computeDripProjection` in `src/lib/utils/finance.ts` (see SPEC.md Section 10). Output: Chart.js line chart with two series — portfolio value and monthly income — over projection period.

Add `user_scenarios` table to schema (run new migration):
```typescript
export const userScenarios = pgTable('user_scenarios', {
  id:          serial('id').primaryKey(),
  userId:      integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 100 }).notNull(),
  params:      text('params').notNull(), // JSON blob of DRIP modeler inputs
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow(),
});
```

### Sprint 8 Completion Criteria

- [ ] User can connect a brokerage via SnapTrade OAuth
- [ ] Holdings sync populates `user_holdings` table
- [ ] `/app/portfolio` shows full holdings with pillar breakdown
- [ ] FI Score renders as progress bar on dashboard
- [ ] DRIP modeler projection chart renders correctly
- [ ] Saved scenarios persist across sessions

---

## Sprint 9 — Phase 2 Advanced Features (Weeks 19–21)

**Goal:** Margin timeline, dividend calendar, grade alerts, settings page.

### 9.1 Margin Timeline (`/app/margin`)

Implement `computeMarginPaydown` in `src/lib/utils/finance.ts` (see SPEC.md Section 10). Chart.js line chart showing remaining balance vs. time. Inputs pulled from user settings (`marginBalance`, `marginRate`).

### 9.2 Dividend Calendar (`/app/calendar`)

Query `etf_dividends` filtered to tickers in `user_holdings`. Display as a monthly grid calendar. Show upcoming ex-dates, payment dates, and amounts. Calculate total projected income for next 30 days.

### 9.3 Grade Alert System

- Weekly cron (`grade-etfs.ts`) already inserts `grade_alerts` rows when grades change
- Daily cron (`send-alerts.ts`): fetch unsent alerts, send email via Resend, mark sent

```typescript
// src/pages/api/cron/send-alerts.ts
const pending = await db.select()
  .from(gradeAlerts)
  .leftJoin(users, eq(gradeAlerts.userId, users.id))
  .leftJoin(etfs, eq(gradeAlerts.etfId, etfs.id))
  .where(eq(gradeAlerts.emailSent, false));

for (const alert of pending) {
  if (!alert.users?.emailAlerts) continue;
  await resend.emails.send({ ... });
  await db.update(gradeAlerts)
    .set({ emailSent: true, alertedAt: new Date() })
    .where(eq(gradeAlerts.id, alert.id));
}
```

### 9.4 Alerts Page (`/app/alerts`)

- List of past grade alerts for user's holdings
- Toggle email alerts on/off (hits user settings update endpoint)

### 9.5 Settings Page (`/app/settings`)

- Stripe customer portal link (Stripe-hosted plan management)
- Brokerage connections list: status, last sync, disconnect button
- Pillar allocation sliders (must sum to 100%)
- Monthly expense target input
- Margin balance and rate inputs
- Email alerts toggle
- Timezone select

### Sprint 9 Completion Criteria

- [ ] Margin paydown chart renders with user's actual margin inputs
- [ ] Dividend calendar shows upcoming payments for held ETFs
- [ ] Grade change triggers alert email (test by manually changing grade in DB)
- [ ] `/app/alerts` lists alert history
- [ ] Settings page saves all user preferences correctly

---

## Sprint 10 — Phase 2 Launch (Week 22)

**Goal:** Production-ready Phase 2, 14-day trial tested, launch campaign.

### 10.1 Pre-Launch Checklist

**Payments:**
- [ ] 14-day trial flow tested end-to-end (sign up → trial → convert or lapse)
- [ ] Stripe customer portal integration tested (cancel, upgrade, downgrade)
- [ ] `past_due` state handled (UI shows payment required banner)
- [ ] Annual vs monthly plan switcher on settings/upgrade page

**Email:**
- [ ] Welcome email fires on first sign-in
- [ ] Trial-ending email (set up in Stripe or via Resend scheduled send)
- [ ] Upgrade prompt email after trial ends

**QA:**
- [ ] All premium features gated (test with free account)
- [ ] Stripe webhook idempotency (duplicate events handled safely)
- [ ] SnapTrade connection survives token refresh

**Legal:**
- [ ] Privacy policy updated to cover Phase 2 data (brokerage read access)
- [ ] Terms updated for subscription billing

### 10.2 Launch Campaign

- [ ] Product Hunt submission prepared (tagline, description, screenshots, maker note)
- [ ] Email list announcement to Phase 1 subscribers
- [ ] Community posts: r/dividends, r/financialindependence with Phase 2 context
- [ ] Demo video (screen recording of dashboard, DRIP modeler, calendar)

---

## Ongoing Maintenance

After Phase 2 launch, recurring tasks:

| Task | Frequency | How |
|---|---|---|
| ETF data sync | Nightly | Vercel Cron → `/api/cron/sync-etfs` |
| Grade recalculation | Weekly | Vercel Cron → `/api/cron/grade-etfs` |
| Alert emails | Daily | Vercel Cron → `/api/cron/send-alerts` |
| Add new ETFs | As needed | Update `scripts/seed-etfs.ts`, run against prod |
| Blog posts | Weekly | Add `.md` to `src/content/blog/`, push to `develop` |
| FMP data agreement | Annually | Review and renew commercial license |
| Dependency updates | Monthly | `npm outdated`, test on `develop`, merge to `main` |

---

## Useful Commands Reference

```bash
# Dev
npm run dev                                          # Start dev server (localhost:4321)
npm run build                                        # Production build
npm run preview                                      # Preview built output

# Type checking
npx astro check                                      # Astro type check
npx tsc --noEmit                                     # TypeScript type check

# Database
npx drizzle-kit generate                             # Generate migration from schema changes
DATABASE_URL=$DEV_DATABASE_URL npx drizzle-kit migrate     # Apply to dev
DATABASE_URL=$PROD_DATABASE_URL npx drizzle-kit migrate    # Apply to prod
npx drizzle-kit studio                               # Open Drizzle Studio (DB GUI)

# Scripts
DATABASE_URL=$DEV_DATABASE_URL npx tsx scripts/seed-etfs.ts
DATABASE_URL=$DEV_DATABASE_URL npx tsx scripts/backfill-history.ts

# Stripe webhook (local dev)
stripe listen --forward-to localhost:4321/api/stripe/webhook
```

---

*ACTION_PLAN v1.0 — Yield to Freedom / Creative Bandit LLC / May 2026*
