# Yield to Freedom — Technical Specification

**Domain:** yieldtofreedom.com  
**Entity:** Creative Bandit LLC  
**Version:** 1.1 | May 2026  

> **As-built vs blueprint:** Section 2–4 and the repository tree reflect the running repo (Astro 6 static + Vercel adapter, Tailwind via PostCSS, content collections, subscribe + compare routes). Phase 2 paths remain forward-looking.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack — Pinned Versions](#2-tech-stack--pinned-versions)
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

- **Phase 1 (public):** Static-first income ETF directory, strategy content, and public calculators. Revenue: AdSense + affiliate links.
- **Phase 2 (authenticated SaaS):** Portfolio dashboard, DRIP modeler, margin timeline, dividend calendar, and grade alerts behind Clerk auth + Stripe subscriptions ($9/mo or $79/yr).

Both phases share one Neon DB instance, one Drizzle ORM layer, one FMP API client, and one Vercel deployment pipeline.

```
yieldtofreedom.com/          → Phase 1 (static + server islands)
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
    └── Public route → Prerendered HTML or server island
            └── ETF data from Neon DB (FMP synced nightly)
```

---

## 2. Tech Stack — Pinned Versions

> All versions are the latest stable releases as of May 2026. Pin these in package.json.

### Core

| Package | Version | Purpose |
|---|---|---|
| `astro` | `6.2.1` | Framework (replaces blueprint's Astro 5 reference) |
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
| `tailwindcss` | `4.2.4` | CSS framework (v4 — CSS-first config) |
| `@tailwindcss/postcss` | `4.2.4` | PostCSS plugin for Tailwind v4 in this repo |
| `postcss` | `^8.5` | Build pipeline for Tailwind |

> **Resolver note:** Do **not** use `@tailwindcss/vite` with the current Astro 6 + Vite 7 stack in this project; Tailwind is wired through `postcss.config.mjs` instead (see §4).

### Auth, Payments, Email

| Package | Version | Purpose |
|---|---|---|
| `@clerk/astro` | `3.1.0` | Auth (sign-up, sign-in, sessions, JWT) |
| `stripe` | `22.1.0` | Subscription billing |
| `resend` | `6.12.2` | Transactional email |

### UI & Charts

| Package | Version | Purpose |
|---|---|---|
| `chart.js` | `4.5.1` | Portfolio charts, DRIP projections |
| `alpinejs` | `3.15.12` | Lightweight reactivity (dropdowns, tabs, toggles) |

### Brokerage (Phase 2)

| Package | Version | Purpose |
|---|---|---|
| `snaptrade-typescript-sdk` | `9.0.191` | Brokerage portfolio import |

### Dev Tools

| Package | Version | Purpose |
|---|---|---|
| `@astrojs/check` | `0.9.9` | Astro type checking |
| `tsx` | latest | Run TypeScript scripts directly |

---

## 3. Repository Structure

```
yield-to-freedom/
├── .env                          # Local env vars (never committed)
├── .env.example
├── .gitignore
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── drizzle.config.ts
│
├── public/
│   ├── favicon.svg
│   └── robots.txt                 # Sitemap pointer; disallow /api/, /app/
│
├── postcss.config.mjs
│
├── src/
│   ├── content.config.ts           # Content collections (blog glob loader)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.astro
│   │   │   ├── Badge.astro
│   │   │   ├── Card.astro
│   │   │   ├── GradeChip.astro
│   │   │   └── Disclaimer.astro
│   │   ├── etf/
│   │   │   ├── EtfCard.astro
│   │   │   ├── EtfTable.astro
│   │   │   ├── EtfScreener.astro     # Client island
│   │   │   ├── EtfCompare.astro
│   │   │   └── DividendChart.astro
│   │   ├── calculator/
│   │   │   ├── StackBuilder.astro
│   │   │   ├── DripModeler.astro     # Phase 2
│   │   │   └── MarginTimeline.astro  # Phase 2
│   │   ├── app/
│   │   │   ├── PortfolioDashboard.astro
│   │   │   ├── PillarChart.astro
│   │   │   ├── FiScore.astro
│   │   │   ├── DividendCalendar.astro
│   │   │   └── BrokerageConnect.astro
│   │   └── layout/
│   │       ├── Header.astro
│   │       ├── Footer.astro
│   │       ├── AppShell.astro
│   │       └── Seo.astro
│   │
│   ├── layouts/
│   │   ├── Base.astro
│   │   └── App.astro
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── sitemap.xml.ts            # Dynamic sitemap (prerender false; Neon + blog URLs)
│   │   ├── etfs/
│   │   │   ├── index.astro
│   │   │   └── [ticker].astro
│   │   ├── strategy/
│   │   │   ├── index.astro
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   └── fi-timeline.astro
│   │   ├── compare/
│   │   │   └── index.astro           # URL ?a & b & c · Alpine
│   │   ├── stack-builder/
│   │   │   └── index.astro           # Client-only math + Chart.js doughnut
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── about.astro
│   │   ├── login.astro               # Phase 2
│   │   ├── subscribe/                # Newsletter UX
│   │   │   ├── confirmed.astro
│   │   │   └── invalid.astro
│   │   │
│   │   ├── app/                      # Phase 2 — SSR, Clerk-protected
│   │   │   ├── index.astro           # Dashboard
│   │   │   ├── portfolio.astro
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   ├── calendar.astro
│   │   │   ├── alerts.astro
│   │   │   └── settings.astro
│   │   │
│   │   └── api/
│   │       ├── etfs/
│   │       │   ├── index.ts
│   │       │   ├── [ticker].ts
│   │       │   └── [ticker]/
│   │       │       └── yield-trail.ts   # GET TTM-style yield series for /compare
│   │       ├── subscribe/
│   │       │   ├── index.ts             # POST JSON body opt-in
│   │       │   └── confirm.ts           # GET ?token= verify + redirect
│   │       ├── portfolio/
│   │       │   ├── sync.ts
│   │       │   └── holdings.ts
│   │       ├── brokerage/
│   │       │   ├── connect.ts
│   │       │   └── callback.ts
│   │       ├── stripe/
│   │       │   ├── checkout.ts
│   │       │   └── webhook.ts
│   │       ├── auth/
│   │       │   └── sync-user.ts      # Clerk webhook handler
│   │       └── cron/
│   │           ├── sync-etfs.ts
│   │           └── grade-etfs.ts     # send-alerts.ts — Phase 2 (not in vercel.json yet)
│   │
│   ├── content/
│   │   └── blog/
│   │       └── *.md
│   │
│   ├── lib/
│   │   ├── charts/                   # dividend-bar, compare-yield-line, pillar-allocation
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.ts
│   │   ├── etfs/                     # TTM yield trail math for /compare
│   │   ├── fmp/
│   │   │   └── client.ts             # https://financialmodelingprep.com/stable
│   │   ├── grader/
│   │   │   ├── grade.ts
│   │   │   └── run-all.ts
│   │   ├── http/                     # cron-auth.ts, json-body.ts
│   │   └── site/                     # publicSiteOrigin() helpers
│   │
│
├── migrations/
│   ├── 0000_initial.sql
│   └── 0001_email_sub_verification_token.sql   # subscribe double opt-in token + index
│
└── scripts/
    ├── seed-etfs.ts
    └── run-grader.ts              # invoked via npm run run-grader
```

---

## 4. Astro Configuration

### Key Change from Blueprint: Astro 6 Output Modes

Astro 5 removed the `hybrid` output mode. In Astro 6:
- `output: 'static'` — prerender by default; individual pages opt into SSR with `export const prerender = false`
- `output: 'server'` — SSR by default; individual pages opt into static with `export const prerender = true`

For this project: use `output: 'static'`. All public pages prerender at build time. All `/app/*` pages declare `export const prerender = false`.

### Key Change: Tailwind v4 (PostCSS, not Vite plugin)

Tailwind v4 ships a PostCSS plugin. **This repo** uses `@tailwindcss/postcss` in `postcss.config.mjs` rather than `@tailwindcss/vite`, because the Vite plugin’s resolver conflicts with Astro 6 / Vite 7 in our setup (`npm run dev` fails to resolve `@import "tailwindcss"` when the plugin is enabled).

Configuration is CSS-first — no required `tailwind.config.js`.

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
  }),
  integrations: [clerk()],
});
```

```javascript
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

```css
/* src/styles/global.css */
@import "tailwindcss";

/* Theme tokens / @theme overrides live here */
```

```typescript
// src/content.config.ts — Content Layer `blog` collection (glob loader + `import { z } from 'astro/zod'`)
```

`tsconfig.json` extends `astro/tsconfigs/strict` with `strictNullChecks: true`.

### Vercel Configuration

```json
// vercel.json (as deployed — Phase 1)
{
  "crons": [
    { "path": "/api/cron/sync-etfs", "schedule": "0 2 * * *" },
    { "path": "/api/cron/grade-etfs", "schedule": "0 3 * * 0" }
  ],
  "functions": {
    "src/pages/api/**/*.ts": { "maxDuration": 60 }
  }
}
```

> **`/api/cron/send-alerts`** is specified for Phase 2 alert email delivery but is **not** registered in `vercel.json` until that route exists in the repo.

### Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## 5. Database Schema

All monetary values stored as decimals with explicit precision. All timestamps UTC.

```typescript
// src/lib/db/schema.ts
import {
  pgTable, serial, varchar, text, integer, decimal,
  boolean, timestamp, date, index, uniqueIndex
} from 'drizzle-orm/pg-core';

// ─── ETF UNIVERSE ─────────────────────────────────────────────────────────────

export const etfs = pgTable('etfs', {
  id:                serial('id').primaryKey(),
  ticker:            varchar('ticker', { length: 10 }).notNull().unique(),
  name:              text('name').notNull(),
  pillar:            varchar('pillar', { length: 20 }).notNull(),
  // 'income' | 'stability' | 'growth' | 'mixed'
  category:          varchar('category', { length: 50 }),
  // 'covered-call' | 'dividend-growth' | 'high-yield' | 'total-return'
  issuer:            varchar('issuer', { length: 100 }),
  lastPrice:         decimal('last_price', { precision: 10, scale: 4 }),
  lastYield:         decimal('last_yield', { precision: 6, scale: 4 }),
  trailing12mYield:  decimal('trailing_12m_yield', { precision: 6, scale: 4 }),
  expenseRatio:      decimal('expense_ratio', { precision: 6, scale: 4 }),
  aum:               decimal('aum', { precision: 18, scale: 2 }),
  dividendFrequency: varchar('dividend_frequency', { length: 20 }),
  // 'monthly' | 'quarterly' | 'annual' | 'irregular'
  dripEligible:      boolean('drip_eligible').default(false),
  incomeSynthetic:   boolean('income_synthetic').default(false),
  ytfGrade:          varchar('ytf_grade', { length: 2 }),
  ytfScore:          decimal('ytf_score', { precision: 5, scale: 2 }),
  gradeUpdatedAt:    timestamp('grade_updated_at'),
  return1y:          decimal('return_1y', { precision: 8, scale: 4 }),
  return3y:          decimal('return_3y', { precision: 8, scale: 4 }),
  return5y:          decimal('return_5y', { precision: 8, scale: 4 }),
  inceptionDate:     date('inception_date'),
  exchange:          varchar('exchange', { length: 10 }),
  fmpLastSynced:     timestamp('fmp_last_synced'),
  isActive:          boolean('is_active').default(true),
  createdAt:         timestamp('created_at').defaultNow(),
  updatedAt:         timestamp('updated_at').defaultNow(),
}, (t) => [
  index('etfs_pillar_idx').on(t.pillar),
  index('etfs_grade_idx').on(t.ytfGrade),
  // ticker uniqueness handled by .unique() on the column — no separate uniqueIndex needed
]);

// ─── DIVIDEND HISTORY ─────────────────────────────────────────────────────────

export const etfDividends = pgTable('etf_dividends', {
  id:             serial('id').primaryKey(),
  etfId:          integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  exDate:         date('ex_date').notNull(),
  paymentDate:    date('payment_date'),
  declaredDate:   date('declared_date'),
  recordDate:     date('record_date'),
  amount:         decimal('amount', { precision: 10, scale: 6 }).notNull(),
  yieldAtPayment: decimal('yield_at_payment', { precision: 6, scale: 4 }),
  adjAmount:      decimal('adj_amount', { precision: 10, scale: 6 }),
  createdAt:      timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('etf_dividends_etf_date_idx').on(t.etfId, t.exDate),
  index('etf_dividends_etf_id_idx').on(t.etfId),
  index('etf_dividends_ex_date_idx').on(t.exDate),
]);

// ─── PRICE HISTORY ────────────────────────────────────────────────────────────

export const etfPrices = pgTable('etf_prices', {
  id:       serial('id').primaryKey(),
  etfId:    integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  date:     date('date').notNull(),
  open:     decimal('open', { precision: 10, scale: 4 }),
  high:     decimal('high', { precision: 10, scale: 4 }),
  low:      decimal('low', { precision: 10, scale: 4 }),
  close:    decimal('close', { precision: 10, scale: 4 }).notNull(),
  adjClose: decimal('adj_close', { precision: 10, scale: 4 }),
  volume:   integer('volume'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  uniqueIndex('etf_prices_etf_date_idx').on(t.etfId, t.date),
  index('etf_prices_etf_id_idx').on(t.etfId),
  index('etf_prices_date_idx').on(t.date),
]);

// ─── GRADE HISTORY ────────────────────────────────────────────────────────────

export const etfGradeHistory = pgTable('etf_grade_history', {
  id:       serial('id').primaryKey(),
  etfId:    integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  grade:    varchar('grade', { length: 2 }).notNull(),
  score:    decimal('score', { precision: 5, scale: 2 }),
  gradedAt: timestamp('graded_at').defaultNow(),
  reason:   text('reason'),
});

// ─── USERS ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:                   serial('id').primaryKey(),
  clerkId:              varchar('clerk_id', { length: 100 }).notNull(),
  email:                varchar('email', { length: 255 }).notNull(),
  subscriptionTier:     varchar('subscription_tier', { length: 20 }).default('free'),
  // 'free' | 'pro'
  subscriptionStatus:   varchar('subscription_status', { length: 20 }).default('inactive'),
  // 'active' | 'inactive' | 'past_due' | 'canceled'
  stripeCustomerId:     varchar('stripe_customer_id', { length: 100 }),
  stripeSubId:          varchar('stripe_sub_id', { length: 100 }),
  currentPeriodEnd:     timestamp('current_period_end'),
  targetIncomeAlloc:    decimal('target_income_alloc', { precision: 5, scale: 2 }).default('40.00'),
  targetStabilityAlloc: decimal('target_stability_alloc', { precision: 5, scale: 2 }).default('30.00'),
  targetGrowthAlloc:    decimal('target_growth_alloc', { precision: 5, scale: 2 }).default('30.00'),
  monthlyExpenseTarget: decimal('monthly_expense_target', { precision: 10, scale: 2 }),
  marginBalance:        decimal('margin_balance', { precision: 12, scale: 2 }).default('0'),
  marginRate:           decimal('margin_rate', { precision: 5, scale: 4 }),
  timezone:             varchar('timezone', { length: 60 }).default('America/New_York'),
  emailAlerts:          boolean('email_alerts').default(true),
  createdAt:            timestamp('created_at').defaultNow(),
  updatedAt:            timestamp('updated_at').defaultNow(),
}, (t) => [
  uniqueIndex('users_clerk_id_idx').on(t.clerkId),
  index('users_email_idx').on(t.email),
]);

// ─── BROKERAGE CONNECTIONS ────────────────────────────────────────────────────

export const brokerageConnections = pgTable('brokerage_connections', {
  id:                 serial('id').primaryKey(),
  userId:             integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  snaptradeUserId:    varchar('snaptrade_user_id', { length: 100 }).notNull(),
  snaptradeAccountId: varchar('snaptrade_account_id', { length: 100 }).notNull(),
  brokerageName:      varchar('brokerage_name', { length: 100 }),
  accountName:        varchar('account_name', { length: 200 }),
  accountNumber:      varchar('account_number', { length: 50 }),
  status:             varchar('status', { length: 20 }).default('active'),
  // 'active' | 'error' | 'disconnected'
  lastSyncAt:         timestamp('last_sync_at'),
  syncError:          text('sync_error'),
  createdAt:          timestamp('created_at').defaultNow(),
  updatedAt:          timestamp('updated_at').defaultNow(),
}, (t) => [
  index('brokerage_connections_user_idx').on(t.userId),
  uniqueIndex('brokerage_connections_account_idx').on(t.snaptradeAccountId),
]);

// ─── USER HOLDINGS ────────────────────────────────────────────────────────────

export const userHoldings = pgTable('user_holdings', {
  id:                    serial('id').primaryKey(),
  userId:                integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId:                 integer('etf_id').references(() => etfs.id),
  brokerageConnectionId: integer('brokerage_connection_id').references(() => brokerageConnections.id),
  ticker:                varchar('ticker', { length: 10 }).notNull(),
  shares:                decimal('shares', { precision: 14, scale: 6 }).notNull(),
  avgCostBasis:          decimal('avg_cost_basis', { precision: 10, scale: 4 }),
  dripEnabled:           boolean('drip_enabled').default(false),
  isManual:              boolean('is_manual').default(false),
  lastSyncedAt:          timestamp('last_synced_at'),
  createdAt:             timestamp('created_at').defaultNow(),
  updatedAt:             timestamp('updated_at').defaultNow(),
}, (t) => [
  index('user_holdings_user_idx').on(t.userId),
  index('user_holdings_user_etf_idx').on(t.userId, t.ticker),
]);

// ─── EMAIL SUBSCRIBERS ────────────────────────────────────────────────────────

export const emailSubscribers = pgTable('email_subscribers', {
  id:          serial('id').primaryKey(),
  email:       varchar('email', { length: 255 }).notNull().unique(),
  source:      varchar('source', { length: 50 }),
  verificationToken: varchar('verification_token', { length: 64 }), // hashed token for double opt-in
  confirmed:   boolean('confirmed').default(false),
  confirmedAt: timestamp('confirmed_at'),
  unsubscribed: boolean('unsubscribed').default(false),
  createdAt:   timestamp('created_at').defaultNow(),
}, (t) => [
  index('email_subscribers_verification_token_idx').on(t.verificationToken),
]);

// ─── GRADE ALERTS ─────────────────────────────────────────────────────────────

export const gradeAlerts = pgTable('grade_alerts', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId:         integer('etf_id').notNull().references(() => etfs.id),
  previousGrade: varchar('previous_grade', { length: 2 }),
  newGrade:      varchar('new_grade', { length: 2 }),
  alertedAt:     timestamp('alerted_at'),
  emailSent:     boolean('email_sent').default(false),
  createdAt:     timestamp('created_at').defaultNow(),
});
```

> **Drizzle v0.45 index syntax:** The third argument to `pgTable` is now an array, not an object returning an index map. Use `(t) => [index(...).on(t.col)]` not `(t) => ({ idx: index(...).on(t.col) })`.

---

## 6. API Surface

### Public API (no auth required)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/etfs` | ETF screener JSON (optional filters; Phase 1 may return full list) |
| `GET` | `/api/etfs/[ticker]` | Single ETF row (JSON mirrors `etfs` table) |
| `GET` | `/api/etfs/[ticker]/yield-trail` | TTM dividend-yield approximation for Compare chart |
| `POST` | `/api/subscribe` | Newsletter opt-in; emails confirm link via Resend when configured |
| `GET` | `/api/subscribe/confirm` | `?token=` — verifies double opt-in, redirects to UX page |

### Authenticated API (Clerk session required)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/portfolio/holdings` | User's holdings |
| `POST` | `/api/portfolio/sync` | Trigger SnapTrade sync |
| `POST` | `/api/brokerage/connect` | Initiate SnapTrade OAuth |
| `GET` | `/api/brokerage/callback` | SnapTrade OAuth return |
| `POST` | `/api/stripe/checkout` | Create Stripe checkout session |

### Webhooks (signed, no user session)

| Method | Path | Verification |
|---|---|---|
| `POST` | `/api/stripe/webhook` | `stripe-signature` header |
| `POST` | `/api/auth/sync-user` | `CLERK_WEBHOOK_SECRET` (svix header) |

### Cron Endpoints (CRON_SECRET bearer token)

| Method | Path | Schedule |
|---|---|---|
| `GET` | `/api/cron/sync-etfs` | `vercel.json` — `0 2 * * *` (02:00 UTC) |
| `GET` | `/api/cron/grade-etfs` | `vercel.json` — `0 3 * * 0` (Sun 03:00 UTC) |
| `GET` | `/api/cron/send-alerts` | *Planned Phase 2* — **not mounted** until route + `vercel.json` entry exist |

### Screener Query Parameters

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

---

## 7. Phase 1 Feature Spec

### Homepage (`/`)

- Hero: headline, subhead, primary CTA ("Explore ETFs"), secondary CTA (email capture)
- Pillar explainer section: Income / Stability / Growth with example ETFs
- Grade highlight cards: top A-grade ETF from each pillar
- Email capture form (leads to Loops.so via Resend double opt-in)
- JSON-LD: `WebSite` + `Organization` schema

### ETF Directory (`/etfs`)

- Server island: `EtfScreener` component renders client-side
- Filters: pillar, grade, dividend frequency, yield range slider, expense ratio slider
- Table view: ticker, name, pillar, grade chip, trailing yield, expense ratio, AUM, frequency
- Sort by any column
- Pagination or virtual scroll if >50 results
- Link each row to `/etfs/[ticker]`

### ETF Profile (`/etfs/[ticker]`)

- Static generated at build time (`getStaticPaths` over active ETF universe)
- Sections: hero (ticker, name, grade), key metrics (yield, ER, AUM, frequency), dividend history chart (Chart.js, last 48 payments), annual yield summary, holdings breakdown (if available from FMP)
- Related ETFs in same pillar
- Links to Compare (pre-populated), Stack Builder (pre-populated)
- JSON-LD: `FinancialProduct` schema
- Disclaimer component (persistent)
- Cache header: `public, s-maxage=86400, stale-while-revalidate=3600`

### Strategy Pages (`/strategy/*`)

- `/strategy` — index with links to sub-pages and 3-pillar diagram
- `/strategy/drip` — DRIP mechanics, compounding math, example scenarios
- `/strategy/margin` — margin arbitrage explainer, risk section
- `/strategy/fi-timeline` — FI Score concept, milestone framework
- JSON-LD: `Article` schema on each page
- Disclaimer on pages referencing ETF data

### Compare Tool (`/compare`)

- URL-driven state: `/compare?a=JEPI&b=SCHD&c=VOO`
- Up to three ETFs via Alpine-driven catalog `<select>`s; URL updates via `history.replaceState`
- Comparison grid pulls live JSON from **`GET /api/etfs/[ticker]`**; overlay pulls **`GET /api/etfs/[ticker]/yield-trail`**
- Multi-series trailing-yield overlay (Chart.js scatter + lines; x = ex-date, y ≈ trailing cash yield %)

### Stack Builder (`/stack-builder`)

- ETF data baked into page as JSON at build time (no API call)
- User selects ETFs, assigns allocation %, enters total investment
- Output: projected monthly income, pillar balance pie chart (Chart.js)
- No auth required; no save functionality (Phase 1)

### Blog (`/blog`)

- Astro Content Layer (`src/content.config.ts`) with `glob()` loader targeting `src/content/blog/*.md` and Zod schema via `astro/zod`
- Listing: `/blog`; posts: `/blog/[slug]` where slug matches collection entry id
- `render()` helper from `astro:content` emits MDX-ish `<Content />` bodies
- JSON-LD `Article` on posts; listing uses `Blog` schema

---

## 8. Phase 2 Feature Spec

All `/app/*` pages declare `export const prerender = false`. All require active Clerk session. Premium routes additionally require `subscriptionTier = 'pro'`.

### Dashboard (`/app`)

Free tier and pro tier both see this page.

- Portfolio value (total), monthly income (projected), pillar balance (pie chart)
- FI Score bar (pro only — blurred with upgrade CTA for free)
- Holdings table with grade chips
- Quick-add holding form (free: max 5 holdings)
- "Connect Brokerage" CTA (pro only)

### Portfolio (`/app/portfolio`)

Pro only.

- Full holdings from brokerage import + manual entries
- Pillar allocation vs. target allocation gap analysis
- Rebalancing suggestions (which pillar is over/under by what %)
- Per-holding: grade, value, yield contribution, DRIP toggle

### DRIP Modeler (`/app/drip`)

Pro only.

- Input: monthly contribution, projection years, per-holding DRIP toggle
- Output: Chart.js line chart (portfolio value + monthly income over time)
- Saved scenarios (store in `user_scenarios` table — add to schema in Sprint 8)

### Margin Timeline (`/app/margin`)

Pro only.

- Input: margin balance, interest rate, monthly income allocation to paydown
- Output: month-by-month paydown chart, projected payoff date
- Updates when user changes margin inputs in settings

### Dividend Calendar (`/app/calendar`)

Pro only.

- Calendar grid view showing upcoming ex-dates and payment dates for held ETFs
- Monthly income total for upcoming month
- Source: `etf_dividends` table filtered to held tickers

### Alerts (`/app/alerts`)

Pro only.

- List of grade change alerts (ETF, previous grade, new grade, date)
- Toggle email alerts on/off

### Settings (`/app/settings`)

Free and pro.

- Subscription management (current plan, next billing date, Stripe customer portal link)
- Brokerage connections (connect, disconnect via SnapTrade)
- Pillar allocation targets (sliders: must sum to 100%)
- Monthly expense target (for FI Score)
- Margin balance and interest rate
- Email alerts toggle
- Timezone preference

### Subscription Tiers

| Feature | Free | Pro ($9/mo or $79/yr) |
|---|---|---|
| ETF directory + screener | Yes | Yes |
| Strategy pages | Yes | Yes |
| Stack Builder | Yes | Yes |
| Dashboard (manual holdings) | 5 max | Unlimited |
| Brokerage import (SnapTrade) | No | Yes |
| DRIP Modeler (save) | No | Yes |
| Margin Timeline | No | Yes |
| FI Score | No | Yes |
| Dividend Calendar | No | Yes |
| Grade Alerts | No | Yes |

---

## 9. Authentication & Authorization

### Route Protection

```
Public:    /*, /etfs/*, /strategy/*, /compare, /stack-builder, /blog/*
Auth:      /login (Clerk-hosted)
Protected: /app/* (valid Clerk session required)
Premium:   /app/drip, /app/margin, /app/calendar, /app/alerts (subscriptionTier = 'pro')
```

### Middleware

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { db } from './lib/db';
import { users } from './lib/db/schema';
import { eq } from 'drizzle-orm';

const isProtected = createRouteMatcher(['/app(.*)']);
const isPremium = createRouteMatcher(['/app/drip', '/app/margin', '/app/calendar', '/app/alerts']);

export const onRequest = clerkMiddleware(async (auth, context) => {
  if (!isProtected(context.request)) return;

  const { userId } = auth();
  if (!userId) return auth().redirectToSignIn();

  if (isPremium(context.request)) {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user || user.subscriptionTier !== 'pro') {
      return Response.redirect(new URL('/app/settings?upgrade=true', context.request.url));
    }
  }
});
```

### Clerk User Sync

On `user.created` Clerk webhook → `POST /api/auth/sync-user` → insert row in `users` table.

```typescript
// src/pages/api/auth/sync-user.ts
export async function POST({ request }) {
  // Verify svix webhook signature before processing
  const payload = await request.json();
  await db.insert(users).values({
    clerkId: payload.data.id,
    email: payload.data.email_addresses[0].email_address,
  }).onConflictDoNothing();
  return Response.json({ ok: true });
}
```

---

## 10. Data Pipeline

### ETF Universe

~75 hand-curated income-relevant ETFs seeded once via `scripts/seed-etfs.ts`. New ETFs added manually.

**Initial universe:**
- Income: JEPI, JEPQ, DIVO, IDVO, QDVO, QYLD, RYLD, XYLD, PBDC, SVOL, SPYI, FEPI, CSHI, GPIQ, TOPW, GOOW, NVII
- Stability: SCHD, VIG, HDV, DVY, SDY, DGRO, NOBL, VYM
- Growth: VOO, SCHG, QQQ, VGT, IBIT, FBTC

### Nightly Sync (`/api/cron/sync-etfs`)

Runs 02:00 UTC. For each active ETF:
1. Fetch ETF profile from FMP (`/etf/info?symbol=`)
2. Upsert key metrics (price, yield, ER, AUM)
3. Upsert last 24 dividend records
4. Upsert last 2 days of EOD prices
5. Rate limit: 200ms delay between tickers (FMP: 300 req/min on commercial)

### Weekly Grade Recalc (`/api/cron/grade-etfs`)

Runs Sunday 03:00 UTC. For each active ETF:
1. Run `calculateYtfGrade` with current data + dividend history
2. Update `ytf_grade`, `ytf_score`, `grade_updated_at`
3. Insert into `etf_grade_history`
4. If grade changed, insert `grade_alerts` rows for all holders

### Daily Alert Delivery (`/api/cron/send-alerts` — Phase 2)

> **Status:** Cron job described for production alert delivery once holders + Resend alerting exist. **`vercel.json` does not invoke this route yet**; inserting rows into `grade_alerts` continues from `grade-etfs.ts`, but outbound email waits on this endpoint.

Runs 08:00 UTC (planned). Send pending `grade_alerts` via Resend, mark `email_sent = true`.

### FMP API Status (Updated May 2026)

FMP retired `/api/v3` and `/api/v4` on 2025-08-31. All endpoints now use `https://financialmodelingprep.com/stable/`. The current free-tier key has partial access:

| Use Case | Endpoint | Free Tier | Notes |
|---|---|---|---|
| ETF profile | `GET /stable/profile?symbol=` | ✅ | Returns price, marketCap, lastDividend, beta, description |
| Dividend history (per symbol) | `GET /stable/dividends?symbol=` | ❌ 402 | Requires commercial plan |
| EOD price history | Not yet found | ❌ | Endpoint path unknown |
| Current quote (ETF) | `GET /stable/quote?symbol=` | ❌ 402 | ETFs require premium |
| Dividend calendar (filtered) | `GET /stable/dividends-calendar?from=` | ❌ 402 | Requires premium |
| Holdings breakdown | Not yet found | ❌ | — |

**Derivable from free profile:** `trailing12mYield = lastDividend / price`, `aum ≈ marketCap`

**Unresolvable without premium or alternate source:** dividend history (consistency scoring), expense ratio, dividend frequency, price history.

**Resolution path:** Either upgrade FMP to commercial plan (~$79/mo) or use Twelve Data ($29/mo, display-permissive) as interim. See ACTION_PLAN.md open decision.

> Phase 1 displays end-of-day data only, always labeled "data as of [date]". No live quotes.

---

## 11. ETF Grading Algorithm

Scores 0–100, maps to A/B/C/D grade. Designed for the Yield to Freedom strategy, not general ETF quality.

| Criterion | Weight | Scoring Notes |
|---|---|---|
| Trailing 12m yield | 30 pts | 0%=0, 3%=10, 12%=30, 20%+=20 (penalizes NAV destruction) |
| Dividend consistency | 20 pts | No cuts=20, 1 cut=10, 2+ cuts=0; missed monthly payments reduce |
| Expense ratio | 15 pts | 0%=15, ≤0.20%=13, ≤0.35%=10, ≤0.60%=7, ≤0.75%=4, ≤1%=1, >1%=0 |
| Dividend frequency | 15 pts | Monthly=15, Quarterly=8, Other=0 |
| AUM / liquidity | 10 pts | ≥$10B=10, ≥$1B=7, ≥$100M=4, <$100M=0 |
| Pillar fit | 10 pts | 10 if ETF fits assigned pillar profile |

| Score | Grade |
|---|---|
| 80–100 | A |
| 60–79 | B |
| 40–59 | C |
| 0–39 | D |

All grade displays must include: *"YTF grades are for research and educational purposes only and do not constitute financial advice."*

---

## 12. Payments & Subscriptions

### Stripe Products

Create in Stripe dashboard before Sprint 7:
- Product: `ytf_pro`
  - Price `price_ytf_monthly`: $9.00/mo recurring
  - Price `price_ytf_annual`: $79.00/yr recurring
- 14-day free trial on first subscription

### Webhook Events

| Event | Action |
|---|---|
| `customer.subscription.created` | `tier='pro'`, `status='active'` |
| `customer.subscription.updated` | Update `current_period_end`, handle plan swap |
| `customer.subscription.deleted` | `tier='free'`, `status='canceled'` |
| `invoice.payment_failed` | `status='past_due'`, send lapse warning email |

### Checkout Flow

```typescript
// src/pages/api/stripe/checkout.ts
const session = await stripe.checkout.sessions.create({
  customer: user.stripeCustomerId ?? undefined,
  customer_email: user.stripeCustomerId ? undefined : user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${origin}/app?upgrade=success`,
  cancel_url: `${origin}/app/settings`,
  metadata: { userId: String(user.id) },
  subscription_data: { trial_period_days: 14 },
});
return Response.json({ url: session.url });
```

Always verify webhook signature with `stripe.webhooks.constructEvent` before processing.

---

## 13. Email & Notifications

### Transactional Emails (Resend)

1. **Welcome** — on `user.created` Clerk webhook
2. **Grade Change Alert** — daily cron from `grade_alerts` table
3. **Subscription Confirmation** — on Stripe `customer.subscription.created`
4. **Payment Failed Warning** — on Stripe `invoice.payment_failed`

Plain HTML string templates rendered server-side. No React Email dependency for v1.

### Email Capture (Newsletter)

- Form on homepage (and optionally blog / stack-builder) POSTs JSON to **`/api/subscribe`**
- Server stores `email_subscribers` row + `verification_token`, sends confirmation via **Resend** when `RESEND_API_KEY` is set (otherwise `{ emailSent: false }` for local/testing)
- `GET /api/subscribe/confirm?token=` validates token via Neon, clears token, redirects to `/subscribe/confirmed` (Uses `PUBLIC_SITE_URL` / `SITE` / request origin — see `src/lib/site/url.ts`)
- Dedicated UX routes: **`/subscribe/confirmed`**, **`/subscribe/invalid`**

---

## 14. Deployment Configuration

### Environments

| Env | Branch | URL | Neon Branch |
|---|---|---|---|
| Production | `main` | yieldtofreedom.com | `main` |
| Preview | `develop` | ytf-preview.vercel.app | `dev` |
| Local | — | localhost:4321 | `dev` |

### Git Workflow

- `main` — production only, PR required, no direct pushes
- `develop` — active development, Vercel preview on every push
- Feature branches for anything touching DB schema

### Migration Workflow

```bash
# Generate from schema changes
npx drizzle-kit generate

# Apply to dev
DATABASE_URL=$DEV_DATABASE_URL npx drizzle-kit migrate

# Apply to production (only after testing on dev)
DATABASE_URL=$PROD_DATABASE_URL npx drizzle-kit migrate
```

Never migrate production without testing on dev branch first. Use Neon's branch feature — dev branch is a copy of production schema.

---

## 15. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Financial Modeling Prep
FMP_API_KEY=your_fmp_commercial_key

# SnapTrade (Phase 2)
SNAPTRADE_CLIENT_ID=your_client_id
SNAPTRADE_CONSUMER_KEY=your_consumer_key

# Clerk
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM="Yield to Freedom <hello@yieldtofreedom.com>"  # optional verified sender / dev fallback

# Cron
CRON_SECRET=minimum_32_char_random_string

# App (server + outbound email links)
PUBLIC_SITE_URL=https://yieldtofreedom.com
# Legacy alias consumed by helpers: SITE=https://yieldtofreedom.com

# Optional client analytics (SSR-injected scripts in Base.astro when set)
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Migrate after schema updates
# npm run db:migrate   # applies ./migrations via drizzle-kit
```

`PUBLIC_` prefix = exposed to client. All others are server-only. Never commit `.env`.

---

## 16. Non-Functional Requirements

### Core Web Vitals Targets

| Metric | Target | Strategy |
|---|---|---|
| LCP | < 2.5s | Static HTML, no client fetch on ETF pages |
| CLS | < 0.1 | Explicit dimensions on chart containers |
| INP | < 200ms | Alpine.js only, no heavy framework runtime |
| TTFB | < 600ms | Static from CDN; SSR behind Vercel edge |

### Caching

- ETF profile pages: `public, s-maxage=86400, stale-while-revalidate=3600`
- App API routes: `private, no-store`
- Static assets: handled by Vercel automatically

### SEO

- Every page: unique `<title>`, `<meta description>`, canonical URL, OG tags
- ETF pages: `FinancialProduct` JSON-LD
- Strategy/blog pages: `Article` JSON-LD (`Blog` type on `/blog` index)
- Homepage: `WebSite` + `Organization` JSON-LD
- **`/sitemap.xml`** — built with `src/pages/sitemap.xml.ts` (`export const prerender = false`) so active ETF URLs (Neon), static routes, and published Markdown posts are enumerated at runtime on Vercel.
- **`public/robots.txt`** — references `https://yieldtofreedom.com/sitemap.xml`, `Disallow: /api/` and `Disallow: /app/`
- **Analytics** — optional GA4: when `PUBLIC_GA_MEASUREMENT_ID` is present, `src/layouts/Base.astro` emits the standard `gtag.js` snippet in `<head>` (no tracking in local dev unless the env var is set).

- WCAG AA minimum
- Semantic HTML throughout
- Keyboard navigable screener and compare tool
- Color not sole indicator of grade (grade letter always present)

---

## 17. Security Specification

### API Route Auth Pattern

```typescript
// All data-mutating API routes
const { userId } = Astro.locals.auth();
if (!userId) return new Response('Unauthorized', { status: 401 });
```

### Cron Auth Pattern

```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

### Stripe Webhook Verification

Always use `stripe.webhooks.constructEvent` with the raw request body before accessing event data.

### SnapTrade

- `snaptradeUserSecret` lives in encrypted session or derived per-request via HMAC — never stored in DB in plaintext
- All brokerage connections are read-only
- Brokerage credentials never touch YTF servers

### Content Security Policy

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' https://js.stripe.com https://clerk.yieldtofreedom.com;
frame-src https://js.stripe.com;
connect-src 'self' https://api.clerk.dev;
img-src 'self' data: https:;
```

### Financial Disclaimer (required on all ETF/financial pages)

> The information provided on Yield to Freedom is for educational and research purposes only. It does not constitute financial advice, investment recommendations, or a solicitation to buy or sell any security. YTF grades are proprietary research tools. Past performance is not indicative of future results. Always consult a licensed financial advisor before making investment decisions. Yield to Freedom is not a registered investment advisor.

---

*SPEC v1.0 — Yield to Freedom / Creative Bandit LLC / May 2026*  
*Stack: Astro 6 + Neon DB + Vercel + Drizzle ORM + Clerk + Stripe + FMP + SnapTrade + Resend*
