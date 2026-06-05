# Yield to Freedom - Technical Specification

**Domain:** yieldtofreedom.com  
**Entity:** Creative Bandit LLC  
**Version:** 1.2 | June 2026  

> **As-built document.** This spec reflects the running repository. Phase 2 sections remain forward-looking and are marked accordingly. Update this file whenever schema, routes, or major features change.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack - Pinned Versions](#2-tech-stack--pinned-versions)
3. [Repository Structure](#3-repository-structure)
4. [Astro Configuration](#4-astro-configuration)
5. [Database Schema](#5-database-schema)
6. [API Surface](#6-api-surface)
7. [Phase 1 Feature Spec](#7-phase-1-feature-spec)
8. [Phase 2 Feature Spec](#8-phase-2-feature-spec)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Data Pipeline](#10-data-pipeline)
11. [ETF Grading Algorithm](#11-etf-grading-algorithm)
12. [Payments & Subscriptions](#12-payments--subscriptions)
13. [Email & Notifications](#13-email--notifications)
14. [Deployment Configuration](#14-deployment-configuration)
15. [Environment Variables](#15-environment-variables)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Security Specification](#17-security-specification)

---

## 1. Project Overview

Yield to Freedom is an income ETF directory, research platform, and portfolio intelligence tool. It is a single Astro monorepo deployed on Vercel serving two distinct phases:

- **Phase 1 (public, live):** Static-first income ETF directory, strategy content, compare tool, stack builder, and public calculators.
- **Phase 2 (authenticated SaaS, planned):** Portfolio dashboard, DRIP modeler, margin timeline, dividend calendar, and grade alerts behind Clerk auth + Stripe subscriptions ($9/mo or $79/yr).

Both phases share one Neon DB instance, one Drizzle ORM layer, one Tiingo API client, and one Vercel deployment pipeline.

```
yieldtofreedom.com/          → Phase 1 (static + SSR opt-in)
yieldtofreedom.com/app/*     → Phase 2 (SSR, Clerk-protected)
```

### Request Flow

```
User Request
    │
    ▼
Vercel Edge Network
    │
    ├── Static asset → CDN immediately
    │
    ├── /app/* → Clerk edge middleware checks session
    │       ├── No session → redirect /login
    │       └── Valid session → SSR Astro page
    │               └── Drizzle → Neon DB
    │
    └── Public route → Prerendered HTML or SSR page
            └── ETF data from Neon DB (Tiingo synced nightly)
```

---

## 2. Tech Stack - Pinned Versions

### Core

| Package | Version | Purpose |
|---|---|---|
| `astro` | `6.2.1` | Framework |
| `@astrojs/vercel` | `10.0.6` | Vercel SSR adapter |
| `typescript` | `6.0.3` | Type checking |

### Database

| Package | Version | Purpose |
|---|---|---|
| `drizzle-orm` | `0.45.2` | Type-safe ORM |
| `drizzle-kit` | `0.31.10` | Migrations CLI |
| `@neondatabase/serverless` | `1.1.0` | Neon HTTP driver |

### Styling

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | `4.2.4` | CSS framework (v4 - CSS-first config) |
| `@tailwindcss/postcss` | `4.2.4` | PostCSS plugin for Tailwind v4 |
| `postcss` | `^8.5` | Build pipeline for Tailwind |

> **Resolver note:** Do **not** use `@tailwindcss/vite` — it conflicts with Astro 6 / Vite 7. Tailwind is wired through `postcss.config.mjs` only.

### Auth, Payments, Email

| Package | Version | Purpose |
|---|---|---|
| `@clerk/astro` | `3.1.0` | Auth (sign-up, sign-in, sessions, JWT) |
| `stripe` | `22.1.0` | Subscription billing |
| `resend` | `6.12.2` | Transactional email |

### UI & Charts

| Package | Version | Purpose |
|---|---|---|
| `chart.js` | `4.5.1` | Dividend charts, price/return overlays, allocation doughnut |
| `alpinejs` | `3.15.12` | Lightweight reactivity (screener, compare, stack builder) |

### Brokerage (Phase 2)

| Package | Version | Purpose |
|---|---|---|
| `snaptrade-typescript-sdk` | `9.0.191` | Brokerage portfolio import |

### Dev Tools

| Package | Version | Purpose |
|---|---|---|
| `@astrojs/check` | `0.9.9` | Astro type checking |
| `tsx` | `^4.20.6` | Run TypeScript scripts directly |
| `dotenv` | `^17.4.2` | Load `.env` in scripts |

---

## 3. Repository Structure

```
yield-to-freedom/
├── .env                              # Local env vars (never committed)
├── .env.example
├── .gitignore
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── postcss.config.mjs
│
├── public/
│   ├── favicon.svg
│   └── robots.txt                   # Sitemap pointer; Disallow /api/, /app/
│
├── docs/
│   └── SPEC.md                      # This file
│
├── src/
│   ├── content.config.ts            # Content Layer: blog glob loader + Zod schema
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Badge.astro          # Pillar/category badge
│   │   │   ├── Card.astro           # Generic card container
│   │   │   ├── GradeChip.astro      # A/B/C/D grade badge
│   │   │   └── Disclaimer.astro     # Financial disclaimer block
│   │   ├── etf/
│   │   │   ├── DividendChart.astro  # Chart.js bar chart of dividend history
│   │   │   └── PriceReturnChart.astro # Chart.js price/total-return line chart
│   │   └── layout/
│   │       ├── Header.astro
│   │       ├── Footer.astro         # Site nav + legal links
│   │       ├── ThemeToggle.astro    # Light/dark mode switch
│   │       └── Seo.astro            # Meta/OG tags helper
│   │
│   ├── layouts/
│   │   └── Base.astro               # Shell: header, slot, footer, GA4 snippet
│   │
│   ├── pages/
│   │   ├── index.astro              # Homepage
│   │   ├── about.astro
│   │   ├── privacy.astro
│   │   ├── terms.astro
│   │   ├── contact.astro            # Web3Forms contact form
│   │   ├── rss.xml.ts               # RSS feed endpoint
│   │   ├── sitemap.xml.ts           # Dynamic sitemap (prerender=false)
│   │   │
│   │   ├── etfs/
│   │   │   ├── index.astro          # ETF directory + Alpine screener
│   │   │   └── [ticker].astro       # ETF profile (static generated)
│   │   │
│   │   ├── strategy/
│   │   │   ├── index.astro          # Pillar diagram + links
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   └── fi-timeline.astro
│   │   │
│   │   ├── compare/
│   │   │   └── index.astro          # URL ?a&b&c · Alpine · Chart.js
│   │   │
│   │   ├── stack-builder/
│   │   │   └── index.astro          # Capital + allocation → income + doughnut
│   │   │
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   │
│   │   ├── subscribe/
│   │   │   ├── confirmed.astro      # Post-verification landing
│   │   │   └── invalid.astro        # Expired/invalid token landing
│   │   │
│   │   ├── app/                     # Phase 2 - SSR, Clerk-protected
│   │   │   ├── index.astro          # Dashboard
│   │   │   ├── portfolio.astro
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   ├── calendar.astro
│   │   │   ├── alerts.astro
│   │   │   └── settings.astro
│   │   │
│   │   └── api/
│   │       ├── etfs/
│   │       │   ├── index.ts              # GET screener
│   │       │   ├── [ticker].ts           # GET single ETF snapshot
│   │       │   └── [ticker]/
│   │       │       ├── yield-trail.ts    # GET TTM yield series (compare overlay)
│   │       │       └── price-history.ts  # GET OHLC points by range (compare chart)
│   │       ├── subscribe/
│   │       │   ├── index.ts              # POST opt-in
│   │       │   └── confirm.ts            # GET ?token= verify + redirect
│   │       ├── portfolio/                # Phase 2
│   │       │   ├── sync.ts
│   │       │   └── holdings.ts
│   │       ├── brokerage/                # Phase 2
│   │       │   ├── connect.ts
│   │       │   └── callback.ts
│   │       ├── stripe/                   # Phase 2
│   │       │   ├── checkout.ts
│   │       │   └── webhook.ts
│   │       ├── auth/                     # Phase 2
│   │       │   └── sync-user.ts
│   │       └── cron/
│   │           ├── sync-etfs.ts          # Daily 02:00 UTC
│   │           └── grade-etfs.ts         # Sunday 03:00 UTC
│   │
│   ├── content/
│   │   └── blog/
│   │       └── *.md
│   │
│   └── lib/
│       ├── db/
│       │   ├── index.ts              # Drizzle + Neon singleton
│       │   └── schema.ts             # All table definitions
│       ├── grader/
│       │   ├── grade.ts              # calculateYtfGrade() - scoring algorithm
│       │   └── run-all.ts            # gradeAllActiveEtfs() - batch runner
│       ├── tiingo/
│       │   └── client.ts             # tiingoGet, tiingoMeta, tiingoPrices, tiingoDividends
│       ├── fmp/
│       │   └── client.ts             # fmpGet - used for ETF holdings + sector weights
│       ├── charts/
│       │   ├── dividend-bar.ts       # Dividend payment bar chart
│       │   ├── price-return-chart.ts # ETF profile price/total-return chart
│       │   ├── compare-yield-line.ts # Compare tool multi-series overlay
│       │   └── pillar-allocation.ts  # Stack builder doughnut
│       ├── etfs/
│       │   ├── compute-trailing-yield-trail.ts  # TTM yield curve for compare
│       │   └── compute-price-history.ts         # Price/return points by time range
│       ├── http/
│       │   ├── cron-auth.ts          # Verify CRON_SECRET bearer token
│       │   └── json-body.ts          # Parse + validate JSON bodies; normalizeEmail()
│       └── site/
│           └── url.ts                # publicSiteOrigin() - resolves PUBLIC_SITE_URL or request origin
│
├── migrations/
│   ├── 0000_initial.sql
│   ├── 0001_email_sub_verification_token.sql   # verificationToken column + index
│   └── 0002_etf_descriptions.sql               # description, holdings_json, sector_weights_json
│
└── scripts/
    ├── seed-etfs.ts              # Upsert ~165-ETF universe (pillar/category/incomeSynthetic)
    ├── seed-etf-statics.ts       # Fill ER / AUM / issuer / frequency from fund disclosures
    ├── backfill-prices.ts        # Fetch historical prices from Tiingo → etf_prices
    ├── backfill-dividends.ts     # Fetch dividend history from Tiingo → etf_dividends
    ├── backfill-metadata.ts      # Fetch inception date + returns from Tiingo
    ├── backfill-etf-descriptions.ts  # Fetch description (Tiingo) + holdings/sectors (FMP)
    ├── backfill-wpay-topw.ts     # Targeted backfill for specific tickers
    ├── fill-missing-data.ts      # Scan NULLs and fill from various sources
    ├── recalc-yields.ts          # Recompute trailing12mYield from dividend history
    ├── run-grader.ts             # Local gradeAllActiveEtfs() (no Vercel timeout)
    ├── sync-etfs.ts              # Local full sync (5-year history, rate-limited)
    └── generate-og-image.ts      # Generate OG preview images for ETF profiles
```

---

## 4. Astro Configuration

### Output Mode

`output: 'static'` — prerender by default. Pages opt into SSR with `export const prerender = false`. All `/app/*` pages use SSR; the dynamic sitemap and a few API routes also opt in.

### Tailwind v4 (PostCSS)

Wired through `postcss.config.mjs` — **not** `@tailwindcss/vite`. Configuration is CSS-first; no `tailwind.config.js` required.

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

export default defineConfig({
  site: 'https://yieldtofreedom.com',
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true },
    edgeMiddleware: true,
    maxDuration: 60,
  }),
  integrations: [clerk()],  // loaded conditionally when PUBLIC_CLERK_PUBLISHABLE_KEY is set
});
```

```javascript
// postcss.config.mjs
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/sync-etfs",   "schedule": "0 2 * * *" },
    { "path": "/api/cron/grade-etfs",  "schedule": "0 3 * * 0" }
  ],
  "functions": {
    "src/pages/api/**/*.ts": { "maxDuration": 60 }
  }
}
```

> `/api/cron/send-alerts` is planned for Phase 2 grade-alert email delivery but is **not** registered in `vercel.json` yet.

### Drizzle Configuration

```typescript
// drizzle.config.ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.NEON_DATABASE_CONNECTION_STRING!,
  },
});
```

---

## 5. Database Schema

All monetary values stored as `decimal` with explicit precision. All timestamps UTC.

```typescript
// src/lib/db/schema.ts
import {
  pgTable, serial, varchar, text, integer, decimal,
  boolean, timestamp, date, jsonb, index, uniqueIndex
} from 'drizzle-orm/pg-core';
```

### `etfs` table

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `ticker` | varchar(10) UNIQUE | |
| `name` | text | |
| `pillar` | varchar(20) | `income` \| `stability` \| `growth` \| `mixed` |
| `category` | varchar(50) | e.g. `covered-call`, `dividend-growth`, `reit` |
| `issuer` | varchar(100) | e.g. `JPMorgan`, `Global X` |
| `last_price` | decimal(10,4) | |
| `last_yield` | decimal(6,4) | Point-in-time yield |
| `trailing_12m_yield` | decimal(6,4) | TTM distribution yield |
| `expense_ratio` | decimal(6,4) | Stored as fraction (0.0035 = 0.35%) |
| `aum` | decimal(18,2) | Full USD |
| `dividend_frequency` | varchar(20) | `monthly` \| `quarterly` \| `annual` \| `weekly` \| `irregular` |
| `drip_eligible` | boolean | default false |
| `income_synthetic` | boolean | true for options-based distributions |
| `ytf_grade` | varchar(2) | `A` \| `B` \| `C` \| `D` |
| `ytf_score` | decimal(5,2) | 0–100 |
| `grade_updated_at` | timestamp | |
| `return_1y` | decimal(8,4) | Simple total return |
| `return_3y` | decimal(8,4) | Annualised CAGR |
| `return_5y` | decimal(8,4) | Annualised CAGR |
| `inception_date` | date | |
| `exchange` | varchar(10) | |
| `fmp_last_synced` | timestamp | Tracks last Tiingo sync (column name kept for compat) |
| `is_active` | boolean | default true |
| `description` | text | Fund strategy description (from Tiingo) |
| `holdings_json` | jsonb | `Array<{ticker, name, weightPercentage}>` — top 15 holdings (from FMP) |
| `sector_weights_json` | jsonb | `Array<{sector, weightPercentage}>` — sector allocation (from FMP) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Indexes: `etfs_pillar_idx (pillar)`, `etfs_grade_idx (ytf_grade)`

---

### `etf_dividends` table

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `etf_id` | integer FK → etfs | cascade delete |
| `ex_date` | date | |
| `payment_date` | date | |
| `declared_date` | date | |
| `record_date` | date | |
| `amount` | decimal(10,6) | Raw distribution per share |
| `yield_at_payment` | decimal(6,4) | |
| `adj_amount` | decimal(10,6) | Split-adjusted amount (preferred for calculations) |
| `created_at` | timestamp | |

Indexes: unique `(etf_id, ex_date)`, `etf_id`, `ex_date`

---

### `etf_prices` table

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `etf_id` | integer FK → etfs | cascade delete |
| `date` | date | |
| `open` | decimal(10,4) | |
| `high` | decimal(10,4) | |
| `low` | decimal(10,4) | |
| `close` | decimal(10,4) NOT NULL | |
| `adj_close` | decimal(10,4) | Preferred for return calculations |
| `volume` | integer | |
| `created_at` | timestamp | |

Indexes: unique `(etf_id, date)`, `etf_id`, `date`

---

### `etf_grade_history` table

| Column | Type |
|---|---|
| `id` | serial PK |
| `etf_id` | integer FK → etfs |
| `grade` | varchar(2) NOT NULL |
| `score` | decimal(5,2) |
| `graded_at` | timestamp defaultNow |
| `reason` | text |

---

### `users` table (Phase 2)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `clerk_id` | varchar(100) UNIQUE | |
| `email` | varchar(255) | |
| `subscription_tier` | varchar(20) | `free` \| `pro`; default `free` |
| `subscription_status` | varchar(20) | `active` \| `inactive` \| `past_due` \| `canceled`; default `inactive` |
| `stripe_customer_id` | varchar(100) | |
| `stripe_sub_id` | varchar(100) | |
| `current_period_end` | timestamp | |
| `target_income_alloc` | decimal(5,2) | default 40.00 |
| `target_stability_alloc` | decimal(5,2) | default 30.00 |
| `target_growth_alloc` | decimal(5,2) | default 30.00 |
| `monthly_expense_target` | decimal(10,2) | For FI Score |
| `margin_balance` | decimal(12,2) | default 0 |
| `margin_rate` | decimal(5,4) | |
| `timezone` | varchar(60) | default `America/New_York` |
| `email_alerts` | boolean | default true |
| `created_at` / `updated_at` | timestamp | |

Indexes: unique `clerk_id`, `email`

---

### `brokerage_connections` table (Phase 2)

| Column | Type |
|---|---|
| `id` | serial PK |
| `user_id` | integer FK → users (cascade) |
| `snaptrade_user_id` | varchar(100) NOT NULL |
| `snaptrade_account_id` | varchar(100) NOT NULL UNIQUE |
| `brokerage_name` | varchar(100) |
| `account_name` | varchar(200) |
| `account_number` | varchar(50) |
| `status` | varchar(20) — `active` \| `error` \| `disconnected` |
| `last_sync_at` | timestamp |
| `sync_error` | text |
| `created_at` / `updated_at` | timestamp |

---

### `user_holdings` table (Phase 2)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `user_id` | integer FK → users | cascade |
| `etf_id` | integer FK → etfs | nullable |
| `brokerage_connection_id` | integer FK → brokerage_connections | nullable |
| `ticker` | varchar(10) NOT NULL | |
| `shares` | decimal(14,6) NOT NULL | |
| `avg_cost_basis` | decimal(10,4) | |
| `drip_enabled` | boolean | default false |
| `is_manual` | boolean | default false |
| `last_synced_at` | timestamp | |
| `created_at` / `updated_at` | timestamp | |

Indexes: `user_id`, unique `(user_id, ticker)`

---

### `email_subscribers` table

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `email` | varchar(255) UNIQUE | |
| `source` | varchar(50) | |
| `verification_token` | varchar(64) | Cleared after confirmation |
| `confirmed` | boolean | default false |
| `confirmed_at` | timestamp | |
| `unsubscribed` | boolean | default false |
| `created_at` | timestamp | |

Index: `verification_token`

---

### `grade_alerts` table (Phase 2)

| Column | Type |
|---|---|
| `id` | serial PK |
| `user_id` | integer FK → users (cascade) |
| `etf_id` | integer FK → etfs |
| `previous_grade` | varchar(2) |
| `new_grade` | varchar(2) |
| `alerted_at` | timestamp |
| `email_sent` | boolean default false |
| `created_at` | timestamp |

> **Drizzle v0.45 index syntax:** The third `pgTable` arg is an array: `(t) => [index('name').on(t.col)]`.

---

## 6. API Surface

### Public API (no auth required)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/etfs` | ETF screener JSON (filters below; max 100 rows) |
| `GET` | `/api/etfs/[ticker]` | Single ETF snapshot (all columns) |
| `GET` | `/api/etfs/[ticker]/yield-trail` | TTM dividend-yield series for compare overlay |
| `GET` | `/api/etfs/[ticker]/price-history?range=` | OHLC + total-return points for compare chart |
| `POST` | `/api/subscribe` | Newsletter opt-in; sends confirm link via Resend when configured |
| `GET` | `/api/subscribe/confirm` | `?token=` — verifies, redirects to `/subscribe/confirmed` or `/subscribe/invalid` |

#### `/api/etfs` Screener Parameters

```
GET /api/etfs?pillar=income&grade=A&frequency=monthly&minYield=5&maxEr=0.75&sort=ytfScore&dir=desc
```

| Param | Values | Default |
|---|---|---|
| `pillar` | `income\|stability\|growth\|mixed\|all` | `all` |
| `grade` | `A\|B\|C\|D\|all` | `all` |
| `frequency` | `monthly\|quarterly\|all` | `all` |
| `minYield` | number (percent, e.g. `5` = 5%) | `0` |
| `maxEr` | number (percent, e.g. `0.75`) | `999` |
| `sort` | `ytfScore\|lastYield\|expenseRatio\|aum` | `ytfScore` |
| `dir` | `asc\|desc` | `desc` |

#### `/api/etfs/[ticker]/price-history` Range Parameter

| Value | Lookback |
|---|---|
| `1y` | 1 year |
| `3y` | 3 years |
| `5y` | 5 years |
| `10y` | 10 years |
| `max` | Full history |

Returns `{ pricePoints: [date, value][], totalReturnPoints: [date, value][] }`.

---

### Authenticated API (Clerk session required — Phase 2)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/portfolio/holdings` | User holdings |
| `POST` | `/api/portfolio/sync` | Trigger SnapTrade sync |
| `POST` | `/api/brokerage/connect` | Initiate SnapTrade OAuth |
| `GET` | `/api/brokerage/callback` | SnapTrade OAuth return |
| `POST` | `/api/stripe/checkout` | Create Stripe checkout session |

### Webhooks (signed, no user session — Phase 2)

| Method | Path | Verification |
|---|---|---|
| `POST` | `/api/stripe/webhook` | `stripe-signature` header |
| `POST` | `/api/auth/sync-user` | Clerk `svix` headers |

### Cron Endpoints (CRON_SECRET bearer token)

| Method | Path | Schedule |
|---|---|---|
| `GET` | `/api/cron/sync-etfs` | `0 2 * * *` (02:00 UTC daily) |
| `GET` | `/api/cron/grade-etfs` | `0 3 * * 0` (Sun 03:00 UTC) |
| `GET` | `/api/cron/send-alerts` | Planned Phase 2 — **not mounted** |

---

## 7. Phase 1 Feature Spec

### Homepage (`/`)

- Hero: headline + primary CTAs (Explore ETFs, Strategy, Blog)
- Stats strip: ETFs graded, 3 pillars, weekly syncs, free access
- Interactive income preview calculator (vanilla JS; capital + yield + monthly target → cashflow blocks)
- Three pillars section with example ETFs per pillar
- Top-rated ETF spotlight: highest YTF score per pillar (A-grade prioritized)
- Latest 3 blog posts
- Newsletter double opt-in (POST to `/api/subscribe`)
- JSON-LD: `WebSite` + `Organization`

### ETF Directory (`/etfs`)

- ETF catalog baked into page as JSON at build time (Neon query)
- Alpine.js screener (`etfScreener()`) with client-side filter + sort
- **Filters:** pillar, grade, frequency, text search (ticker/name)
- **View modes:** cards (4-column grid) or list (sortable table)
- **Card fields:** pillar stripe, ticker, grade chip, name, badges, TTM yield, price, ER, frequency, AUM, YTF score, 1Y/3Y/5Y returns, DRIP/synthetic badges
- **List fields:** ticker, name, pillar, grade, TTM yield, ER, price, AUM, frequency, DRIP, 1Y return, score
- Result count shown; "X ETFs match filters"

### ETF Profile (`/etfs/[ticker]`)

- Static generated at build time via `getStaticPaths` over active ETF universe
- **Sections (in order):**
  1. Hero — ticker, full name, grade chip, pillar/category badges, compare link
  2. $10k income snapshot — annual income, monthly average, per-period estimate, DRIP framing
  3. Key metrics grid — last price, TTM yield, ER, AUM, inception date, frequency, grade + score, returns (1Y/3Y/5Y)
  4. About — fund description paragraph (from `description` column; hidden if NULL)
  5. Top Holdings — ranked table with ticker, name, weight % (from `holdings_json`; hidden if NULL)
  6. Sector Allocation — bar chart + % list sorted by weight (from `sector_weights_json`; hidden if NULL)
  7. Price / Total Return chart (Chart.js; from price history in DB)
  8. Distributions — stats grid (TTM sum, avg payment, projected annual, trend), income & DRIP calculator, bar chart, history table (last 48 payments)
  9. Related ETFs — same pillar, up to 8
- JSON-LD: `FinancialProduct` + `BreadcrumbList`
- Meta description prefers the fund's own description when available; falls back to generated text from yield/ER/frequency
- Disclaimer component (persistent)

### Strategy Pages (`/strategy/*`)

- `/strategy` — pillar diagram + links
- `/strategy/drip` — DRIP mechanics, compounding math
- `/strategy/margin` — margin arbitrage explainer, risk section
- `/strategy/fi-timeline` — FI Score concept, milestone framework

### Compare Tool (`/compare`)

- URL-driven state: `/compare?a=JEPI&b=SCHD&c=VOO` (up to 3 tickers)
- Alpine.js state; URL updates via `history.replaceState`
- **Pillar tabs** filter the ETF dropdown options per slot
- **Chart modes:** Price (normalized % change from first point) or Total Return
- **Time ranges:** 1Y, 3Y, 5Y, 10Y, Max — fetches from `GET /api/etfs/[ticker]/price-history?range=X`
- Chart.js multi-series line chart; deduplicates overlapping series
- **Metrics grid per slot:** name, pillar, grade, TTM yield, ER, price, AUM, frequency, DRIP, synthetic income flag, 1Y/3Y/5Y returns, inception date, data sync date
- Data sources: `/api/etfs/[ticker]` (snapshot) + `/api/etfs/[ticker]/price-history` (chart)

### Stack Builder (`/stack-builder`)

- ETF catalog baked at build time (ticker, name, pillar, TTM yield)
- **Inputs:** total capital + up to 3 ETF slots with allocation %
- Equal-weight button normalizes weights; weights < 100% model idle cash
- **Output:** projected monthly income + pillar balance doughnut (Chart.js)
- No auth; no save (Phase 1)

### Blog (`/blog`)

- Astro Content Layer (`src/content.config.ts`), `glob()` loader targeting `src/content/blog/*.md`
- Listing: `/blog`; posts: `/blog/[slug]`
- JSON-LD: `Article` on posts, `Blog` on listing

### Contact (`/contact`)

- Name, email, message form
- Posts to Web3Forms (`api.web3forms.com/submit`) — no backend required
- Honeypot field for spam filtering
- Success: form replaced by confirmation message; failure: inline error

### Newsletter Subscribe Flow

- POST `/api/subscribe` — validates email, generates 48-byte hex token, upserts `email_subscribers` row, sends confirm email via Resend
- GET `/api/subscribe/confirm?token=` — sets `confirmed=true`, clears token, redirects to `/subscribe/confirmed` or `/subscribe/invalid`

---

## 8. Phase 2 Feature Spec

All `/app/*` pages: `export const prerender = false`. All require active Clerk session. Premium routes additionally require `subscriptionTier = 'pro'`.

### Dashboard (`/app`)

Free + Pro.

- Portfolio value, monthly income, pillar balance pie chart
- FI Score (Pro only — blurred with upgrade CTA for free)
- Holdings table with grade chips
- Quick-add holding form (free: max 5)
- "Connect Brokerage" CTA (Pro only)

### Portfolio (`/app/portfolio`) — Pro

- Full holdings (brokerage import + manual)
- Pillar allocation vs. target gap analysis
- Rebalancing suggestions
- Per-holding: grade, value, yield contribution, DRIP toggle

### DRIP Modeler (`/app/drip`) — Pro

- Input: monthly contribution, projection years, DRIP toggle per holding
- Output: Chart.js line chart (portfolio value + monthly income over time)

### Margin Timeline (`/app/margin`) — Pro

- Input: margin balance, interest rate, monthly income allocation to paydown
- Output: month-by-month paydown chart + projected payoff date

### Dividend Calendar (`/app/calendar`) — Pro

- Calendar view of upcoming ex-dates and payment dates for held ETFs
- Source: `etf_dividends` filtered to held tickers

### Alerts (`/app/alerts`) — Pro

- Grade change alert list (ETF, previous grade, new grade, date)
- Email alerts toggle

### Settings (`/app/settings`) — Free + Pro

- Subscription management + Stripe portal link
- Brokerage connections (SnapTrade)
- Pillar allocation targets (must sum to 100%)
- Monthly expense target, margin balance + rate
- Email alerts toggle, timezone

### Subscription Tiers

| Feature | Free | Pro ($9/mo or $79/yr) |
|---|---|---|
| ETF directory + screener | Yes | Yes |
| Strategy pages | Yes | Yes |
| Stack Builder + Compare | Yes | Yes |
| Dashboard (manual holdings) | 5 max | Unlimited |
| Brokerage import (SnapTrade) | No | Yes |
| DRIP Modeler | No | Yes |
| Margin Timeline | No | Yes |
| FI Score | No | Yes |
| Dividend Calendar | No | Yes |
| Grade Alerts | No | Yes |

---

## 9. Authentication & Authorization

### Route Protection

```
Public:    /*, /etfs/*, /strategy/*, /compare, /stack-builder, /blog/*, /contact
Auth:      /login (Clerk-hosted)
Protected: /app/* (valid Clerk session required)
Premium:   /app/drip, /app/margin, /app/calendar, /app/alerts (subscriptionTier='pro')
```

### Middleware

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { db } from './lib/db';
import { users } from './lib/db/schema';
import { eq } from 'drizzle-orm';

const isProtected = createRouteMatcher(['/app(.*)']);
const isPremium   = createRouteMatcher(['/app/drip', '/app/margin', '/app/calendar', '/app/alerts']);

export const onRequest = clerkMiddleware(async (auth, context) => {
  if (!isProtected(context.request)) return;
  const { userId } = auth();
  if (!userId) return auth().redirectToSignIn();
  if (isPremium(context.request)) {
    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user || user.subscriptionTier !== 'pro') {
      return Response.redirect(new URL('/app/settings?upgrade=true', context.request.url));
    }
  }
});
```

### Clerk User Sync

On `user.created` Clerk webhook → `POST /api/auth/sync-user` → insert row in `users` table.

---

## 10. Data Pipeline

### ETF Universe

~165 hand-curated income-relevant ETFs seeded via `scripts/seed-etfs.ts`. Taxonomy (pillar / category / incomeSynthetic) is canonical in that file — re-running the script is safe (`ON CONFLICT DO UPDATE`). After seeding, run `seed-etf-statics.ts` to fill ER / AUM / issuer / frequency from fund disclosures.

**Universe by pillar → category:**

*Income:* `covered-call` (JEPI, JEPQ, DIVO, QYLD, XYLD, RYLD, SPYI, QQQI, GPIQ, FEPI, AIPI, NUSI, XDTE, QDTE, WDTE, QQQY, SPYT, IWMY, …) · `option-income` (SVOL; YieldMax series YMAG/YMAX/ULTY/TSLY/NVDY/… ; Roundhill WeeklyPay NVDW/TSLW/AAPW/…) · `high-yield` (PBDC, BIZD, KLIP, CSHI, HNDL, MDIV, TOPW) · `preferred-stock` (PFF, PGX, PFFD, FPE, PFXF, SPFF) · `reit` (VNQ, IYR, SCHH, XLRE, REM, MORT, KBWY) · `mlp` (AMLP, MLPA, MLPX, ENFR) · `bond-income` (HYG, JNK, USHY, BKLN, SRLN, LQD, BNDI, HYBI)

*Stability:* `dividend-growth` (SCHD, VIG, HDV, DVY, SDY, DGRO, NOBL, VYM, DGRW, SCHY, SPHD, …) · `bond` (AGG, BND, TLT, TIP, VCIT, TLTI)

*Growth:* `total-return` (VOO, IVV, SPY, VTI, SCHG, QQQ, QQQM, VUG, VGT, XLK, IWM, ARKK, IBIT, FBTC)

---

### Nightly Sync (`/api/cron/sync-etfs`) — 02:00 UTC

For each active ETF:
1. Fetch 5-year EOD price history from Tiingo → upsert `etf_prices`
2. Fetch dividend history from Tiingo → upsert `etf_dividends` (last 24 records); falls back to `divCash > 0` from EOD rows when dedicated endpoint returns empty
3. Fetch metadata from Tiingo for exchange + inception date (first run only — never overwritten)
4. Compute and upsert: `last_price`, `trailing_12m_yield`, `dividend_frequency`, `return_1y/3y/5y`
5. Rate limit: 200ms between tickers (Tiingo free tier: 500 req/hour)

**Computed fields:**
- `trailing_12m_yield` — sum of `adjDivCash` entries in last 365 days ÷ current `adjClose`
- `dividend_frequency` — count `divCash > 0` rows in last 13 months: ≥10 → monthly, ≥3 → quarterly, ≥1 → annual, else irregular
- `return_1y` — `adjClose_now / adjClose_1yr_ago − 1`
- `return_3y` / `return_5y` — annualised CAGR: `(adjClose_now / adjClose_Nyr_ago)^(1/N) − 1`
- `inception_date` — from Tiingo `startDate` on first sync, or earliest price row as fallback

---

### Weekly Grade Recalc (`/api/cron/grade-etfs`) — Sunday 03:00 UTC

1. Run `calculateYtfGrade` for each active ETF
2. Update `ytf_grade`, `ytf_score`, `grade_updated_at`
3. Insert row into `etf_grade_history`
4. If grade changed, insert `grade_alerts` rows for all holders (Phase 2; email delivery pending)

---

### ETF Descriptions Backfill (`scripts/backfill-etf-descriptions.ts`)

One-time + on-demand. Only fills NULL rows by default; `--force` flag refreshes all.

- `description` — from Tiingo `/tiingo/daily/<ticker>` (`description` field)
- `holdings_json` — top 15 holdings from FMP `/stable/etf-holder?symbol=<ticker>`
- `sector_weights_json` — from FMP `/stable/etf-sector-weightings?symbol=<ticker>`

Rate-limited (150–200ms between calls). Re-run safely.

---

### Data Sources

#### Tiingo (primary — daily prices + dividends + metadata)

Auth: `Authorization: Token <key>` header.

| Use Case | Endpoint | Notes |
|---|---|---|
| ETF metadata | `GET /tiingo/daily/<ticker>` | name, exchangeCode, description, startDate |
| Latest EOD price | `GET /tiingo/daily/<ticker>/prices` | close, adjClose, OHLCV, divCash, splitFactor |
| Historical EOD prices | `GET /tiingo/daily/<ticker>/prices?startDate=` | same fields |
| Dividend history | `GET /tiingo/dividends/<ticker>?startDate=` | exDate, divCash, adjDivCash, payDate |

Free tier: 500 req/hour. End-of-day data only — always labeled "data as of [date]".

#### FMP (Financial Modeling Prep — descriptions/holdings/sectors)

Auth: `?apikey=<key>` query param. Base: `https://financialmodelingprep.com/stable`.

| Use Case | Endpoint |
|---|---|
| ETF holdings | `GET /etf-holder?symbol=<ticker>` |
| Sector weights | `GET /etf-sector-weightings?symbol=<ticker>` |

Used only in the descriptions backfill script, not in the nightly cron.

---

## 11. ETF Grading Algorithm

Scores 0–100, maps to A/B/C/D. Designed for the Yield to Freedom income strategy — not general ETF quality.

| Criterion | Weight | Scoring |
|---|---|---|
| Trailing 12m yield | 30 pts | 0%=0, 3%=10, 12%=30; ≥12% stays at 30 (no taper) |
| Dividend consistency | 20 pts | Monthly/quarterly: cuts >10% from prior = 0 cuts→20, 1→10, 2+→0. Weekly: delivery rate ≥92%=20, ≥75%=10, <75%=0 |
| Expense ratio | 15 pts | ≤0.20%=15, ≤0.50%=13, ≤0.70%=10, ≤0.90%=7, ≤1.10%=4, ≤1.50%=1, >1.50%=0 |
| Dividend frequency | 15 pts | Weekly or monthly=15, quarterly=8, other=0 |
| AUM / liquidity | 10 pts | ≥$10B=10, ≥$1B=7, ≥$100M=4, <$100M=0 |
| Pillar fit | 10 pts | 10 if category matches assigned pillar profile, else 0 |

| Score | Grade |
|---|---|
| 80–100 | A |
| 60–79 | B |
| 40–59 | C |
| 0–39 | D |

All grade displays must include: *"YTF grades are for research and educational purposes only and do not constitute financial advice."*

---

## 12. Payments & Subscriptions

### Stripe Products (Phase 2 — create before launch)

- Product: `ytf_pro`
  - `price_ytf_monthly`: $9.00/mo recurring
  - `price_ytf_annual`: $79.00/yr recurring
- 14-day free trial on first subscription

### Webhook Events

| Event | Action |
|---|---|
| `customer.subscription.created` | `tier='pro'`, `status='active'` |
| `customer.subscription.updated` | Update `current_period_end`, handle plan swap |
| `customer.subscription.deleted` | `tier='free'`, `status='canceled'` |
| `invoice.payment_failed` | `status='past_due'`, send lapse warning email |

Always verify webhook signature with `stripe.webhooks.constructEvent` before processing.

---

## 13. Email & Notifications

### Transactional Emails via Resend

1. **Subscribe confirmation** — double opt-in link (live)
2. **Welcome** — on `user.created` Clerk webhook (Phase 2)
3. **Grade Change Alert** — daily cron from `grade_alerts` table (Phase 2)
4. **Subscription Confirmation** — on Stripe `customer.subscription.created` (Phase 2)
5. **Payment Failed Warning** — on Stripe `invoice.payment_failed` (Phase 2)

Plain HTML string templates rendered server-side. No React Email dependency.

When `RESEND_API_KEY` is not set (local dev), subscribe endpoint returns `{ ok: true, emailSent: false }`.

---

## 14. Deployment Configuration

### Environments

| Env | Branch | URL | Neon Branch |
|---|---|---|---|
| Production | `main` | yieldtofreedom.com | `main` |
| Preview | `develop` | ytf-preview.vercel.app | `dev` |
| Local | — | localhost:4321 | `dev` |

### Git Workflow

- `main` — production only; PR required
- `develop` — active development; Vercel preview on every push
- Feature branches for anything touching DB schema

### Migration Workflow

```bash
# 1. Edit src/lib/db/schema.ts
# 2. Generate migration file
npx drizzle-kit generate

# 3. Apply to dev
DATABASE_URL=$DEV_DATABASE_URL npx drizzle-kit migrate

# 4. Apply to production (after testing)
DATABASE_URL=$PROD_DATABASE_URL npx drizzle-kit migrate
```

Alternatively, apply raw SQL via the Neon MCP or `npx drizzle-kit migrate` directly. Never skip dev testing before production.

---

## 15. Environment Variables

```bash
# Database (Neon pooled — preferred)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
# Legacy alias still supported
# NEON_DATABASE_CONNECTION_STRING=

# Tiingo (primary data provider)
TIINGO_API_KEY=

# FMP (used for ETF holdings/sector backfill only)
FMP_API_KEY=

# Cron
CRON_SECRET=minimum_32_char_random_string

# Resend (subscribe double opt-in + Phase 2 alerts)
RESEND_API_KEY=
RESEND_FROM="Yield to Freedom <hello@yieldtofreedom.com>"   # optional; Resend dev sender fallback

# App
PUBLIC_SITE_URL=https://yieldtofreedom.com  # no trailing slash; used in confirm email links

# Optional: GA4 (injected in Base.astro when present; no tracking without it)
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Phase 2: Clerk
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# Phase 2: Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...

# Phase 2: SnapTrade
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
```

`PUBLIC_` prefix = exposed to client. All others are server-only. Never commit `.env`.

---

## 16. Non-Functional Requirements

### Core Web Vitals Targets

| Metric | Target | Strategy |
|---|---|---|
| LCP | < 2.5s | Static HTML; no client fetch on ETF pages |
| CLS | < 0.1 | Explicit dimensions on chart containers |
| INP | < 200ms | Alpine.js only; no heavy framework runtime |
| TTFB | < 600ms | Static from CDN; SSR behind Vercel edge |

### Caching

- ETF profile pages: `public, s-maxage=86400, stale-while-revalidate=3600`
- App API routes: `private, no-store`
- Static assets: handled by Vercel automatically

### SEO

- Every page: unique `<title>`, `<meta description>`, canonical URL, OG tags
- ETF pages: `FinancialProduct` + `BreadcrumbList` JSON-LD; meta description prefers fund's own description
- Strategy/blog: `Article` JSON-LD; blog listing uses `Blog` schema
- Homepage: `WebSite` + `Organization` JSON-LD
- `/sitemap.xml` — dynamic (`prerender=false`); enumerates Neon ETF slugs + static routes + blog posts
- `public/robots.txt` — references sitemap; `Disallow: /api/` and `Disallow: /app/`
- GA4 — injected in `Base.astro` when `PUBLIC_GA_MEASUREMENT_ID` is set

### Accessibility

- WCAG AA minimum
- Semantic HTML throughout
- Keyboard-navigable screener and compare tool
- Grade letter always present (color not sole indicator)

---

## 17. Security Specification

### Cron Auth Pattern

```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

### API Route Auth Pattern (Phase 2)

```typescript
const { userId } = Astro.locals.auth();
if (!userId) return new Response('Unauthorized', { status: 401 });
```

### Stripe Webhook Verification

Always use `stripe.webhooks.constructEvent` with the raw request body before accessing event data.

### SnapTrade (Phase 2)

- `snaptradeUserSecret` lives in encrypted session or derived per-request via HMAC — never stored in DB plaintext
- All brokerage connections are read-only
- Brokerage credentials never touch YTF servers

### Financial Disclaimer (required on all ETF/financial pages)

> The information provided on Yield to Freedom is for educational and research purposes only. It does not constitute financial advice, investment recommendations, or a solicitation to buy or sell any security. YTF grades are proprietary research tools. Past performance is not indicative of future results. Always consult a licensed financial advisor before making investment decisions. Yield to Freedom is not a registered investment advisor.

---

*SPEC v1.2 — Yield to Freedom / Creative Bandit LLC / June 2026*  
*Stack: Astro 6 · Neon (PostgreSQL) · Vercel · Drizzle ORM · Tailwind v4 · Alpine.js · Chart.js · Tiingo · FMP · Resend · Clerk (Phase 2) · Stripe (Phase 2) · SnapTrade (Phase 2)*
