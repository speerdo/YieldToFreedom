# Yield to Freedom — Technical Blueprint

**Domain:** yieldtofreedom.com
**Entity:** Creative Bandit LLC
**Version:** 1.0 | May 2026
**Stack:** Astro 5 + Neon DB + Vercel (full monorepo)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Tech Stack — Full Decision Record](#3-tech-stack--full-decision-record)
4. [Database Schema](#4-database-schema)
5. [API Integrations](#5-api-integrations)
6. [Data Pipeline](#6-data-pipeline)
7. [ETF Grading Algorithm](#7-etf-grading-algorithm)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Phase 1 — Page Architecture](#9-phase-1--page-architecture)
10. [Phase 2 — App Architecture](#10-phase-2--app-architecture)
11. [Payments & Subscriptions](#11-payments--subscriptions)
12. [Email & Notifications](#12-email--notifications)
13. [Deployment & CI/CD](#13-deployment--cicd)
14. [Environment Variables](#14-environment-variables)
15. [Performance & SEO](#15-performance--seo)
16. [Security Considerations](#16-security-considerations)
17. [Sprint-by-Sprint Build Plan](#17-sprint-by-sprint-build-plan)
18. [Open Questions & Decisions](#18-open-questions--decisions)

---

## 1. Architecture Overview

Yield to Freedom is a single Astro monorepo deployed on Vercel. It serves two distinct user experiences from one codebase:

- **Phase 1 (public):** Static-first income ETF directory and educational content hub. Pages are prerendered at build time where possible and use server islands for live data widgets. Primary revenue: AdSense + affiliate links.
- **Phase 2 (authenticated app):** Portfolio intelligence SaaS behind Clerk auth middleware. Pages are server-rendered on demand. Primary revenue: Stripe subscriptions ($9/mo or $79/yr).

Both phases share:
- The same Neon DB (Postgres) instance
- The same Drizzle ORM layer
- The same FMP API client
- The same Vercel deployment pipeline

```
yieldtofreedom.com/          → Phase 1 (SSG + server islands)
yieldtofreedom.com/app/*     → Phase 2 (SSR, Clerk-protected)
```

There is no separate subdomain for the app in v1. If Phase 2 traffic demands it, `app.yieldtofreedom.com` can be split out later as a separate Vercel deployment pointing at the same Neon DB.

### High-Level Request Flow

```
User Request
    │
    ▼
Vercel Edge Network
    │
    ├── Static asset? → Serve from CDN immediately
    │
    ├── /app/* route? → Clerk middleware checks session
    │       ├── No session → redirect /login
    │       └── Valid session → SSR Astro page
    │               └── Drizzle query → Neon DB
    │                       └── FMP API (cached, not live)
    │
    └── Public route → Prerendered HTML or server island
            └── ETF data from Neon DB cache (FMP synced nightly)
```

---

## 2. Monorepo Structure

```
yield-to-freedom/
├── .env                          # Local env vars (never committed)
├── .env.example                  # Template for all required vars
├── .gitignore
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── tailwind.config.mjs
│
├── public/
│   ├── favicon.svg
│   ├── og-default.png            # Default OpenGraph image
│   └── robots.txt
│
├── src/
│   ├── components/
│   │   ├── ui/                   # Shared primitive components
│   │   │   ├── Button.astro
│   │   │   ├── Badge.astro
│   │   │   ├── Card.astro
│   │   │   └── GradeChip.astro   # A/B/C/D grade display
│   │   ├── etf/
│   │   │   ├── EtfCard.astro
│   │   │   ├── EtfTable.astro
│   │   │   ├── EtfScreener.astro # Client island for filtering
│   │   │   ├── EtfCompare.astro
│   │   │   └── DividendChart.astro
│   │   ├── calculator/
│   │   │   ├── StackBuilder.astro      # No-auth income calculator
│   │   │   ├── DripModeler.astro       # Phase 2
│   │   │   └── MarginTimeline.astro    # Phase 2
│   │   ├── app/
│   │   │   ├── PortfolioDashboard.astro
│   │   │   ├── PillarChart.astro
│   │   │   ├── FiScore.astro
│   │   │   ├── DividendCalendar.astro
│   │   │   └── BrokerageConnect.astro
│   │   └── layout/
│   │       ├── Header.astro
│   │       ├── Footer.astro
│   │       ├── AppShell.astro    # Phase 2 app wrapper
│   │       └── Seo.astro
│   │
│   ├── layouts/
│   │   ├── Base.astro            # Public layout
│   │   └── App.astro             # Authenticated app layout
│   │
│   ├── pages/
│   │   ├── index.astro           # Homepage
│   │   ├── etfs/
│   │   │   ├── index.astro       # ETF directory + screener
│   │   │   └── [ticker].astro    # Dynamic ETF profile (SSG)
│   │   ├── strategy/
│   │   │   ├── index.astro
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   └── fi-timeline.astro
│   │   ├── compare.astro
│   │   ├── stack-builder.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── about.astro
│   │   ├── login.astro           # Clerk sign-in page
│   │   │
│   │   ├── app/                  # Phase 2 — all SSR, Clerk-protected
│   │   │   ├── index.astro       # Dashboard
│   │   │   ├── portfolio.astro
│   │   │   ├── drip.astro
│   │   │   ├── margin.astro
│   │   │   ├── calendar.astro
│   │   │   ├── alerts.astro
│   │   │   └── settings.astro
│   │   │
│   │   └── api/                  # Vercel serverless functions
│   │       ├── etfs/
│   │       │   ├── index.ts      # GET /api/etfs (screener)
│   │       │   └── [ticker].ts   # GET /api/etfs/:ticker
│   │       ├── portfolio/
│   │       │   ├── sync.ts       # POST /api/portfolio/sync (SnapTrade)
│   │       │   └── holdings.ts   # GET /api/portfolio/holdings
│   │       ├── brokerage/
│   │       │   ├── connect.ts    # POST — initiate SnapTrade OAuth
│   │       │   └── callback.ts   # GET — SnapTrade OAuth callback
│   │       ├── stripe/
│   │       │   ├── checkout.ts   # POST — create Stripe session
│   │       │   └── webhook.ts    # POST — Stripe event handler
│   │       └── cron/
│   │           ├── sync-etfs.ts  # Nightly FMP data refresh
│   │           └── grade-etfs.ts # Weekly grade recalculation
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts          # Drizzle client singleton
│   │   │   └── schema.ts         # Full Drizzle schema
│   │   ├── fmp/
│   │   │   ├── client.ts         # FMP API wrapper
│   │   │   ├── etfs.ts           # ETF-specific FMP calls
│   │   │   └── dividends.ts      # Dividend history calls
│   │   ├── snaptrade/
│   │   │   └── client.ts         # SnapTrade API wrapper
│   │   ├── grader/
│   │   │   └── grade.ts          # YTF grade algorithm
│   │   ├── stripe/
│   │   │   └── client.ts         # Stripe client
│   │   ├── clerk/
│   │   │   └── middleware.ts     # Auth middleware for /app/*
│   │   └── utils/
│   │       ├── finance.ts        # Yield calc, DRIP math, FI score
│   │       └── format.ts         # Currency, date, percent formatters
│   │
│   ├── content/
│   │   └── blog/                 # Markdown blog posts
│   │       └── *.md
│   │
│   └── middleware.ts             # Global Astro middleware (Clerk)
│
├── migrations/                   # Drizzle SQL migrations
│   └── 0001_initial.sql
│
└── scripts/
    ├── seed-etfs.ts              # One-time ETF universe seed
    └── backfill-history.ts       # Historical dividend backfill
```

---

## 3. Tech Stack — Full Decision Record

Every tool was chosen with solo-developer bandwidth and cost in mind. The guiding principle: use what you already know unless there is a clear, specific reason not to.

### Core Framework

**Astro 5**
- Output mode: `hybrid` — allows per-page prerender/SSR decisions
- Static pages (ETF profiles, strategy content, homepage) use `export const prerender = true`
- App pages (`/app/*`) use `export const prerender = false` (SSR on every request)
- Server islands for any public page that needs a live data widget (screener, stack builder)
- Why not SvelteKit: Astro is already proven in your directory stack. The interactivity needed in Phase 2 (charts, sliders, calculators) does not require a full SPA framework — Astro with client-side scripts or lightweight Alpine.js is sufficient.

### Database

**Neon DB (Postgres)**
- Serverless Postgres, already familiar from eBikeLocal
- Free tier: 0.5 GB storage, 190 compute hours/month — sufficient for development and early Phase 1
- Launch tier ($19/mo): 10 GB storage, autoscaling compute — target for Phase 2 launch
- Connection pooling via Neon's built-in PgBouncer (critical for Vercel serverless where connections are not persistent)
- Connection string format: `postgresql://user:pass@host/dbname?sslmode=require`

**Drizzle ORM**
- Type-safe SQL, minimal overhead, excellent Neon compatibility
- `drizzle-orm` + `drizzle-kit` for migrations
- Schema-first: define in `src/lib/db/schema.ts`, generate migrations with `drizzle-kit generate`
- No magic: SQL is visible and predictable

```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(import.meta.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

### Hosting & Deployment

**Vercel**
- Hobby tier is sufficient for Phase 1
- Pro tier ($20/mo) required for Phase 2: custom domains on all environments, team features, and no bandwidth restrictions
- Cron jobs handled via Vercel Cron (configured in `vercel.json`) — fires the `/api/cron/*` endpoints on schedule
- Edge middleware for Clerk auth — runs at the edge before any SSR

### Styling

**Tailwind CSS v4**
- Already in use on GoT Risk project — familiar
- v4 uses CSS-first config (`@import "tailwindcss"` in global CSS, no `tailwind.config.js` required)
- Component classes extracted into `.astro` files — no separate CSS files needed

### Authentication

**Clerk**
- Handles sign-up, sign-in, session management, and JWT validation
- Free tier: 10,000 MAU — more than enough for Phase 2 launch
- Astro integration: `@clerk/astro` package
- Middleware protects all `/app/*` routes
- User ID from Clerk (`clerkId`) stored in `users` table as foreign key

### Payments

**Stripe**
- Subscription billing: `price_monthly` ($9/mo) and `price_annual` ($79/yr) products
- Checkout: redirect to Stripe-hosted page via `/api/stripe/checkout`
- Webhook: `/api/stripe/webhook` handles `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- Customer portal: Stripe-hosted for plan changes and cancellation

### Email

**Resend**
- Transactional email (welcome, dividend alerts, grade change notifications)
- Free tier: 3,000 emails/month — sufficient for Phase 1 email capture and early Phase 2
- React Email templates (even in Astro project — template rendering is Node-side)
- Newsletter via **Loops.so** (integrates with Resend, handles unsubscribes automatically)

### Interactive Components

Rather than pulling in a full frontend framework for Phase 2 interactivity, the following lightweight approach is used:

- **Alpine.js** (via CDN or npm) for small reactive UI: toggle states, tab switching, filter dropdowns
- **Chart.js** for portfolio charts, DRIP modeler output, income projections
- **Astro client islands** (`client:load`, `client:visible`) for any component that needs reactivity
- This avoids React/Vue/Svelte as a dependency while still achieving full interactivity

---

## 4. Database Schema

Full Drizzle schema. All monetary values stored as integers (cents) or decimals with explicit precision. All timestamps stored as UTC.

```typescript
// src/lib/db/schema.ts
import {
  pgTable, serial, varchar, text, integer, decimal,
  boolean, timestamp, date, index, uniqueIndex
} from 'drizzle-orm/pg-core';

// ─── ETF UNIVERSE ────────────────────────────────────────────────────────────

export const etfs = pgTable('etfs', {
  id:                 serial('id').primaryKey(),
  ticker:             varchar('ticker', { length: 10 }).notNull().unique(),
  name:               text('name').notNull(),

  // Classification
  pillar:             varchar('pillar', { length: 20 }).notNull(),
  // 'income' | 'stability' | 'growth' | 'mixed'

  category:           varchar('category', { length: 50 }),
  // e.g. 'covered-call', 'dividend-growth', 'high-yield', 'total-return'

  issuer:             varchar('issuer', { length: 100 }),
  // e.g. 'JPMorgan', 'Schwab', 'Global X'

  // Key metrics (refreshed nightly)
  lastPrice:          decimal('last_price', { precision: 10, scale: 4 }),
  lastYield:          decimal('last_yield', { precision: 6, scale: 4 }),
  // annualized yield as decimal e.g. 0.0842 = 8.42%

  trailing12mYield:   decimal('trailing_12m_yield', { precision: 6, scale: 4 }),
  expenseRatio:       decimal('expense_ratio', { precision: 6, scale: 4 }),
  aum:                decimal('aum', { precision: 18, scale: 2 }),
  // in USD

  // Dividend characteristics
  dividendFrequency:  varchar('dividend_frequency', { length: 20 }),
  // 'monthly' | 'quarterly' | 'annual' | 'irregular'

  dripEligible:       boolean('drip_eligible').default(false),
  incomeSynthetic:    boolean('income_synthetic').default(false),
  // true for covered-call ETFs that generate option premium income

  // YTF Grade
  ytfGrade:           varchar('ytf_grade', { length: 2 }),
  // 'A' | 'B' | 'C' | 'D'

  ytfScore:           decimal('ytf_score', { precision: 5, scale: 2 }),
  // 0.00 to 100.00

  gradeUpdatedAt:     timestamp('grade_updated_at'),

  // Performance
  return1y:           decimal('return_1y', { precision: 8, scale: 4 }),
  return3y:           decimal('return_3y', { precision: 8, scale: 4 }),
  return5y:           decimal('return_5y', { precision: 8, scale: 4 }),

  // Metadata
  inceptionDate:      date('inception_date'),
  exchange:           varchar('exchange', { length: 10 }),
  fmpLastSynced:      timestamp('fmp_last_synced'),
  isActive:           boolean('is_active').default(true),
  createdAt:          timestamp('created_at').defaultNow(),
  updatedAt:          timestamp('updated_at').defaultNow(),
}, (t) => ({
  tickerIdx: uniqueIndex('etfs_ticker_idx').on(t.ticker),
  pillarIdx: index('etfs_pillar_idx').on(t.pillar),
  gradeIdx:  index('etfs_grade_idx').on(t.ytfGrade),
}));

// ─── DIVIDEND HISTORY ────────────────────────────────────────────────────────

export const etfDividends = pgTable('etf_dividends', {
  id:           serial('id').primaryKey(),
  etfId:        integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  exDate:       date('ex_date').notNull(),
  paymentDate:  date('payment_date'),
  declaredDate: date('declared_date'),
  recordDate:   date('record_date'),
  amount:       decimal('amount', { precision: 10, scale: 6 }).notNull(),
  // per-share dividend amount

  yieldAtPayment: decimal('yield_at_payment', { precision: 6, scale: 4 }),
  adjAmount:      decimal('adj_amount', { precision: 10, scale: 6 }),
  // split-adjusted amount

  createdAt:    timestamp('created_at').defaultNow(),
}, (t) => ({
  etfDateIdx: uniqueIndex('etf_dividends_etf_date_idx').on(t.etfId, t.exDate),
  etfIdIdx:   index('etf_dividends_etf_id_idx').on(t.etfId),
  exDateIdx:  index('etf_dividends_ex_date_idx').on(t.exDate),
}));

// ─── PRICE HISTORY ───────────────────────────────────────────────────────────

export const etfPrices = pgTable('etf_prices', {
  id:           serial('id').primaryKey(),
  etfId:        integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  date:         date('date').notNull(),
  open:         decimal('open', { precision: 10, scale: 4 }),
  high:         decimal('high', { precision: 10, scale: 4 }),
  low:          decimal('low', { precision: 10, scale: 4 }),
  close:        decimal('close', { precision: 10, scale: 4 }).notNull(),
  adjClose:     decimal('adj_close', { precision: 10, scale: 4 }),
  volume:       integer('volume'),
  createdAt:    timestamp('created_at').defaultNow(),
}, (t) => ({
  etfDateIdx: uniqueIndex('etf_prices_etf_date_idx').on(t.etfId, t.date),
  etfIdIdx:   index('etf_prices_etf_id_idx').on(t.etfId),
  dateIdx:    index('etf_prices_date_idx').on(t.date),
}));

// ─── ETF GRADE HISTORY ───────────────────────────────────────────────────────
// Tracks grade changes over time for alert system and historical view

export const etfGradeHistory = pgTable('etf_grade_history', {
  id:         serial('id').primaryKey(),
  etfId:      integer('etf_id').notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  grade:      varchar('grade', { length: 2 }).notNull(),
  score:      decimal('score', { precision: 5, scale: 2 }),
  gradedAt:   timestamp('graded_at').defaultNow(),
  reason:     text('reason'),
  // JSON snapshot of the scoring inputs at time of grade
});

// ─── USERS ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:             serial('id').primaryKey(),
  clerkId:        varchar('clerk_id', { length: 100 }).notNull().unique(),
  email:          varchar('email', { length: 255 }).notNull(),

  // Subscription
  subscriptionTier:   varchar('subscription_tier', { length: 20 }).default('free'),
  // 'free' | 'pro'

  subscriptionStatus: varchar('subscription_status', { length: 20 }).default('inactive'),
  // 'active' | 'inactive' | 'past_due' | 'canceled'

  stripeCustomerId:   varchar('stripe_customer_id', { length: 100 }),
  stripeSubId:        varchar('stripe_sub_id', { length: 100 }),
  currentPeriodEnd:   timestamp('current_period_end'),

  // YTF Strategy settings
  targetIncomeAlloc:     decimal('target_income_alloc', { precision: 5, scale: 2 }).default('40.00'),
  targetStabilityAlloc:  decimal('target_stability_alloc', { precision: 5, scale: 2 }).default('30.00'),
  targetGrowthAlloc:     decimal('target_growth_alloc', { precision: 5, scale: 2 }).default('30.00'),
  monthlyExpenseTarget:  decimal('monthly_expense_target', { precision: 10, scale: 2 }),
  // user's monthly expense goal for FI Score calc

  // Margin tracking
  marginBalance:   decimal('margin_balance', { precision: 12, scale: 2 }).default('0'),
  marginRate:      decimal('margin_rate', { precision: 5, scale: 4 }),
  // e.g. 0.065 = 6.5%

  // Preferences
  timezone:        varchar('timezone', { length: 60 }).default('America/New_York'),
  emailAlerts:     boolean('email_alerts').default(true),

  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow(),
}, (t) => ({
  clerkIdIdx: uniqueIndex('users_clerk_id_idx').on(t.clerkId),
  emailIdx:   index('users_email_idx').on(t.email),
}));

// ─── BROKERAGE CONNECTIONS ───────────────────────────────────────────────────

export const brokerageConnections = pgTable('brokerage_connections', {
  id:                   serial('id').primaryKey(),
  userId:               integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  snaptradeUserId:      varchar('snaptrade_user_id', { length: 100 }).notNull(),
  snaptradeAccountId:   varchar('snaptrade_account_id', { length: 100 }).notNull(),
  brokerageName:        varchar('brokerage_name', { length: 100 }),
  accountName:          varchar('account_name', { length: 200 }),
  accountNumber:        varchar('account_number', { length: 50 }),
  // masked, e.g. "****1234"

  status:               varchar('status', { length: 20 }).default('active'),
  // 'active' | 'error' | 'disconnected'

  lastSyncAt:           timestamp('last_sync_at'),
  syncError:            text('sync_error'),
  createdAt:            timestamp('created_at').defaultNow(),
  updatedAt:            timestamp('updated_at').defaultNow(),
}, (t) => ({
  userIdx:    index('brokerage_connections_user_idx').on(t.userId),
  accountIdx: uniqueIndex('brokerage_connections_account_idx').on(t.snaptradeAccountId),
}));

// ─── USER HOLDINGS ───────────────────────────────────────────────────────────

export const userHoldings = pgTable('user_holdings', {
  id:                   serial('id').primaryKey(),
  userId:               integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId:                integer('etf_id').references(() => etfs.id),
  // nullable: user may hold something not in our ETF universe

  brokerageConnectionId: integer('brokerage_connection_id')
                          .references(() => brokerageConnections.id),
  // null if manually entered

  ticker:               varchar('ticker', { length: 10 }).notNull(),
  shares:               decimal('shares', { precision: 14, scale: 6 }).notNull(),
  avgCostBasis:         decimal('avg_cost_basis', { precision: 10, scale: 4 }),
  dripEnabled:          boolean('drip_enabled').default(false),
  isManual:             boolean('is_manual').default(false),
  // true = user typed it in, false = synced from brokerage

  lastSyncedAt:         timestamp('last_synced_at'),
  createdAt:            timestamp('created_at').defaultNow(),
  updatedAt:            timestamp('updated_at').defaultNow(),
}, (t) => ({
  userIdx:    index('user_holdings_user_idx').on(t.userId),
  userEtfIdx: index('user_holdings_user_etf_idx').on(t.userId, t.ticker),
}));

// ─── EMAIL SUBSCRIBERS ───────────────────────────────────────────────────────

export const emailSubscribers = pgTable('email_subscribers', {
  id:            serial('id').primaryKey(),
  email:         varchar('email', { length: 255 }).notNull().unique(),
  source:        varchar('source', { length: 50 }),
  // 'homepage', 'blog', 'stack-builder', etc.

  confirmed:     boolean('confirmed').default(false),
  confirmedAt:   timestamp('confirmed_at'),
  unsubscribed:  boolean('unsubscribed').default(false),
  createdAt:     timestamp('created_at').defaultNow(),
});

// ─── GRADE ALERTS ────────────────────────────────────────────────────────────

export const gradeAlerts = pgTable('grade_alerts', {
  id:           serial('id').primaryKey(),
  userId:       integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId:        integer('etf_id').notNull().references(() => etfs.id),
  previousGrade: varchar('previous_grade', { length: 2 }),
  newGrade:     varchar('new_grade', { length: 2 }),
  alertedAt:    timestamp('alerted_at'),
  emailSent:    boolean('email_sent').default(false),
  createdAt:    timestamp('created_at').defaultNow(),
});
```

---

## 5. API Integrations

### 5.1 Financial Modeling Prep (FMP)

**Purpose:** ETF profile data, dividend history, EOD prices, ETF screener.
**Required plan:** Commercial (Build tier, ~$79/mo). Personal plans prohibit public data display.
**Base URL:** `https://financialmodelingprep.com/api/v3`

> Before launch: contact FMP at site.financialmodelingprep.com to execute a Data Display and Licensing Agreement. Do not display FMP data publicly without this in place.

```typescript
// src/lib/fmp/client.ts
const FMP_BASE = 'https://financialmodelingprep.com/api/v3';
const FMP_KEY = import.meta.env.FMP_API_KEY;

async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FMP_BASE}${path}`);
  url.searchParams.set('apikey', FMP_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FMP ${path} failed: ${res.status}`);
  return res.json();
}

// Endpoints used:
// GET /etf/info?symbol=SCHD                     → ETF profile
// GET /historical-price-full/stock_dividend/:symbol → Dividend history
// GET /historical-price-full/:symbol?from=&to=  → EOD price history
// GET /quote/:symbol                            → Current quote
// GET /etf-holder/:symbol                       → Holdings breakdown
// GET /stock_dividend_calendar?from=&to=        → Upcoming dividends
```

Key endpoints mapped to use cases:

| Use Case | FMP Endpoint | Frequency |
|---|---|---|
| ETF profile (yield, AUM, ER) | `/etf/info?symbol=` | Nightly |
| Dividend history | `/historical-price-full/stock_dividend/:symbol` | Nightly |
| EOD price history | `/historical-price-full/:symbol` | Nightly |
| Current quote | `/quote/:symbol` | Nightly (not live) |
| Dividend calendar (next 90 days) | `/stock_dividend_calendar` | Nightly |
| ETF holdings breakdown | `/etf-holder/:symbol` | Weekly |

Phase 1 does NOT show live prices. All data is end-of-day, cached in Neon, and displayed with a "data as of [date]" label. Live quotes are a Phase 2 premium feature.

### 5.2 SnapTrade

**Purpose:** OAuth-based brokerage portfolio import. Phase 2 only.
**SDK:** `snaptrade-typescript-sdk`
**Supports:** Robinhood, Schwab, Fidelity, E*TRADE, IBKR, and 50+ others.
**Auth model:** OAuth2 — user credentials never touch our servers.
**Pricing:** Free tier (limited connections), pay-as-you-go for production.

```typescript
// src/lib/snaptrade/client.ts
import { SnapTrade } from 'snaptrade-typescript-sdk';

export const snaptrade = new SnapTrade({
  clientId: import.meta.env.SNAPTRADE_CLIENT_ID,
  consumerKey: import.meta.env.SNAPTRADE_CONSUMER_KEY,
});

// Flow:
// 1. Register SnapTrade user (one-time per our user):
//    snaptrade.authentication.registerSnapTradeUser({ userId })
//    → returns userSecret (store encrypted in users table or session)

// 2. Generate connection portal URL:
//    snaptrade.authentication.loginSnapTradeUser({ userId, userSecret })
//    → redirectURI to show user — they connect their brokerage

// 3. After connection, fetch holdings:
//    snaptrade.accountInformation.getUserHoldings({ userId, userSecret })
//    → returns accounts with positions

// 4. Sync positions to user_holdings table
```

### 5.3 Stripe

**Purpose:** Subscription billing.

```typescript
// src/lib/stripe/client.ts
import Stripe from 'stripe';
export const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

// Products to create in Stripe dashboard:
// - prod_ytf_pro
//   - price_ytf_monthly: $9.00/mo (recurring)
//   - price_ytf_annual:  $79.00/yr (recurring)

// Checkout session creation (src/pages/api/stripe/checkout.ts):
const session = await stripe.checkout.sessions.create({
  customer_email: user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${origin}/app?upgrade=success`,
  cancel_url: `${origin}/app/settings`,
  metadata: { userId: String(user.id) },
});
```

Webhook events to handle:

| Event | Action |
|---|---|
| `customer.subscription.created` | Set `subscription_tier = 'pro'`, `subscription_status = 'active'` |
| `customer.subscription.updated` | Update `current_period_end`, handle plan changes |
| `customer.subscription.deleted` | Set `subscription_tier = 'free'`, `subscription_status = 'canceled'` |
| `invoice.payment_failed` | Set `subscription_status = 'past_due'`, send alert email |

### 5.4 Clerk

**Purpose:** Auth (sign-up, sign-in, sessions).

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtected = createRouteMatcher(['/app(.*)']);

export const onRequest = clerkMiddleware((auth, context) => {
  if (isProtected(context.request) && !auth().userId) {
    return auth().redirectToSignIn();
  }
});
```

On first sign-in, create user row in Neon:

```typescript
// src/pages/api/auth/sync-user.ts
// Called from Clerk webhook on user.created event
export async function POST({ request }) {
  const payload = await request.json();
  await db.insert(users).values({
    clerkId: payload.data.id,
    email: payload.data.email_addresses[0].email_address,
  }).onConflictDoNothing();
}
```

### 5.5 Resend

**Purpose:** Transactional email (welcome, alerts, dividend calendar digest).

```typescript
import { Resend } from 'resend';
export const resend = new Resend(import.meta.env.RESEND_API_KEY);

// Example: grade change alert
await resend.emails.send({
  from: 'alerts@yieldtofreedom.com',
  to: user.email,
  subject: `Grade Alert: ${ticker} changed from ${prev} to ${next}`,
  html: gradeAlertTemplate({ ticker, prev, next, user }),
});
```

---

## 6. Data Pipeline

### 6.1 ETF Universe

The initial ETF universe is a curated list of ~75 income-relevant ETFs. This is not auto-discovered — it is hand-curated and seeded once. New ETFs are added manually as the category evolves.

**Initial universe (examples):**

Income pillar: JEPI, JEPQ, DIVO, IDVO, QDVO, SCHD (mixed), TOPW, GOOW, NVII, QYLD, RYLD, XYLD, PBDC, SVOL, SPYI, FEPI, CSHI, GPIQ

Stability pillar: SCHD, VIG, HDV, DVY, SDY, DGRO, NOBL, VYM

Growth pillar: VOO, SCHG, QQQ, VGT, IBIT, FBTC

```typescript
// scripts/seed-etfs.ts
// Run once: npx tsx scripts/seed-etfs.ts
const ETF_UNIVERSE = [
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'VOO',  name: 'Vanguard S&P 500 ETF', pillar: 'growth', category: 'total-return' },
  // ... full list
];

for (const etf of ETF_UNIVERSE) {
  await db.insert(etfs).values(etf).onConflictDoNothing();
}
```

### 6.2 Nightly Sync Cron

Runs at 02:00 UTC daily (after US markets close and FMP data is updated).

```typescript
// src/pages/api/cron/sync-etfs.ts
// vercel.json: { "crons": [{ "path": "/api/cron/sync-etfs", "schedule": "0 2 * * *" }] }

export async function GET({ request }) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const allEtfs = await db.select().from(etfs).where(eq(etfs.isActive, true));

  for (const etf of allEtfs) {
    try {
      // 1. Fetch current profile from FMP
      const profile = await fmpGetEtfProfile(etf.ticker);

      // 2. Upsert ETF record
      await db.update(etfs)
        .set({
          lastPrice: profile.price,
          lastYield: profile.yield,
          expenseRatio: profile.expenseRatio,
          aum: profile.aum,
          fmpLastSynced: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(etfs.ticker, etf.ticker));

      // 3. Upsert latest dividend records
      const dividends = await fmpGetDividendHistory(etf.ticker);
      for (const div of dividends.slice(0, 24)) { // last 24 payments
        await db.insert(etfDividends)
          .values({ etfId: etf.id, ...mapDividend(div) })
          .onConflictDoUpdate({
            target: [etfDividends.etfId, etfDividends.exDate],
            set: { amount: div.dividend, paymentDate: div.paymentDate },
          });
      }

      // 4. Upsert EOD price (last 365 days on initial run, incremental after)
      const prices = await fmpGetPriceHistory(etf.ticker, { days: 2 });
      for (const price of prices) {
        await db.insert(etfPrices)
          .values({ etfId: etf.id, ...mapPrice(price) })
          .onConflictDoNothing();
      }

      // Rate limit: FMP allows 300 req/min on commercial plan
      await sleep(200);

    } catch (err) {
      console.error(`Failed to sync ${etf.ticker}:`, err);
      // Continue to next ETF — don't fail entire job
    }
  }

  return new Response('OK');
}
```

### 6.3 Weekly Grade Recalculation

Runs Sunday at 03:00 UTC. Recalculates YTF grades for all ETFs and logs changes for the alert system.

```typescript
// src/pages/api/cron/grade-etfs.ts
// vercel.json: { "path": "/api/cron/grade-etfs", "schedule": "0 3 * * 0" }

for (const etf of allEtfs) {
  const previousGrade = etf.ytfGrade;
  const { grade, score } = calculateYtfGrade(etf);

  await db.update(etfs)
    .set({ ytfGrade: grade, ytfScore: score, gradeUpdatedAt: new Date() })
    .where(eq(etfs.id, etf.id));

  // Log grade history
  await db.insert(etfGradeHistory).values({ etfId: etf.id, grade, score });

  // If grade changed, queue alert for users who hold this ETF
  if (previousGrade && previousGrade !== grade) {
    const holders = await db
      .select({ userId: userHoldings.userId })
      .from(userHoldings)
      .where(eq(userHoldings.etfId, etf.id));

    for (const { userId } of holders) {
      await db.insert(gradeAlerts).values({
        userId, etfId: etf.id, previousGrade, newGrade: grade,
      });
    }
  }
}
```

---

## 7. ETF Grading Algorithm

The YTF Grade is a proprietary score from 0-100 mapped to A/B/C/D. It is designed specifically for the Yield to Freedom strategy — it does not attempt to be a general ETF quality score.

**Scoring criteria (total: 100 points):**

| Criterion | Weight | Notes |
|---|---|---|
| Trailing 12-month yield | 30 pts | Scaled: 0% = 0, 12%+ = 30 (diminishing returns above 15% — penalizes NAV-destruction ETFs) |
| Dividend consistency | 20 pts | No missed/cut payments in last 12 months = 20, 1 cut = 10, 2+ cuts = 0 |
| Expense ratio | 15 pts | 0.00% = 15, 0.35% = 10, 0.75% = 5, 1.00%+ = 0 |
| Dividend frequency | 15 pts | Monthly = 15, Quarterly = 8, Annual/Irregular = 0 |
| AUM / liquidity | 10 pts | $10B+ = 10, $1B+ = 7, $100M+ = 4, <$100M = 0 |
| Pillar fit | 10 pts | 10 if ETF matches its assigned pillar's ideal profile, partial otherwise |

**Grade thresholds:**

| Score | Grade | Meaning |
|---|---|---|
| 80-100 | A | Core holding — strong fit for YTF strategy |
| 60-79 | B | Good holding — minor trade-offs |
| 40-59 | C | Situational — use with awareness of trade-offs |
| 0-39 | D | Not recommended for YTF strategy |

```typescript
// src/lib/grader/grade.ts
export function calculateYtfGrade(etf: typeof etfs.$inferSelect & {
  dividends: typeof etfDividends.$inferSelect[]
}) {
  let score = 0;

  // 1. Yield score (30 pts)
  const yield12m = Number(etf.trailing12mYield ?? 0);
  score += Math.min(30, Math.max(0,
    yield12m < 0.03 ? yield12m / 0.03 * 10 :
    yield12m < 0.12 ? 10 + (yield12m - 0.03) / 0.09 * 20 :
    yield12m < 0.20 ? 30 - (yield12m - 0.12) / 0.08 * 10 : 20
    // Penalizes extremely high yields (NAV destruction risk)
  ));

  // 2. Consistency score (20 pts)
  const last12Divs = etf.dividends
    .filter(d => new Date(d.exDate) > new Date(Date.now() - 365 * 86400 * 1000))
    .sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());

  const hasCut = last12Divs.some((d, i) => {
    if (i === 0) return false;
    return Number(d.amount) < Number(last12Divs[i - 1].amount) * 0.85;
  });
  const missedPayments = etf.dividendFrequency === 'monthly'
    ? 12 - last12Divs.length : 0;

  score += hasCut ? 0 : missedPayments > 1 ? 5 : missedPayments === 1 ? 10 : 20;

  // 3. Expense ratio (15 pts)
  const er = Number(etf.expenseRatio ?? 1);
  score += er <= 0 ? 15 : er <= 0.20 ? 13 : er <= 0.35 ? 10 :
           er <= 0.60 ? 7 : er <= 0.75 ? 4 : er <= 1.00 ? 1 : 0;

  // 4. Frequency (15 pts)
  score += etf.dividendFrequency === 'monthly' ? 15 :
           etf.dividendFrequency === 'quarterly' ? 8 : 0;

  // 5. AUM (10 pts)
  const aum = Number(etf.aum ?? 0);
  score += aum >= 10e9 ? 10 : aum >= 1e9 ? 7 : aum >= 100e6 ? 4 : 0;

  // 6. Pillar fit (10 pts) — simplified
  score += 10; // Default full fit; reduce manually for edge cases

  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  return { grade, score };
}
```

**Important:** All grade displays on the site must carry the disclaimer: *"YTF grades are for research and educational purposes only and do not constitute financial advice. Past performance is not indicative of future results."*

---

## 8. Authentication & Authorization

### Route Protection Strategy

```
Public routes:   /*, /etfs/*, /strategy/*, /compare, /stack-builder, /blog/*
Auth routes:     /login, /sign-up (handled by Clerk)
Protected routes: /app/* (require active Clerk session)
Premium routes:  /app/drip, /app/margin, /app/calendar, /app/alerts
                 (require subscription_tier = 'pro')
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
  if (!isProtected(context.request)) return; // public route, pass through

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

### Getting User in SSR Pages

```typescript
// src/pages/app/index.astro
---
import { db } from '../lib/db';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const clerkUserId = Astro.locals.auth().userId!; // guaranteed by middleware

const [user] = await db.select()
  .from(users)
  .where(eq(users.clerkId, clerkUserId))
  .limit(1);
---
```

---

## 9. Phase 1 — Page Architecture

### Static Generation Strategy

ETF profile pages are statically generated at build time. With ~75 ETFs, build time is negligible.

```typescript
// src/pages/etfs/[ticker].astro
---
export async function getStaticPaths() {
  const allEtfs = await db.select({
    ticker: etfs.ticker
  }).from(etfs).where(eq(etfs.isActive, true));

  return allEtfs.map(({ ticker }) => ({ params: { ticker } }));
}

const { ticker } = Astro.params;
const [etf] = await db.select().from(etfs)
  .where(eq(etfs.ticker, ticker.toUpperCase()))
  .limit(1);

if (!etf) return Astro.redirect('/etfs');

const dividendHistory = await db.select()
  .from(etfDividends)
  .where(eq(etfDividends.etfId, etf.id))
  .orderBy(desc(etfDividends.exDate))
  .limit(48); // last 4 years of monthly payments
---
```

### Screener API Endpoint

The screener is a server island — it fetches filtered results client-side so the main ETF page can be statically generated.

```typescript
// src/pages/api/etfs/index.ts
export async function GET({ url }) {
  const pillar = url.searchParams.get('pillar');       // income|stability|growth|all
  const grade  = url.searchParams.get('grade');        // A|B|C|D|all
  const freq   = url.searchParams.get('frequency');    // monthly|quarterly|all
  const minYield = parseFloat(url.searchParams.get('minYield') ?? '0');
  const maxEr    = parseFloat(url.searchParams.get('maxEr') ?? '999');
  const sort     = url.searchParams.get('sort') ?? 'ytfScore';
  const dir      = url.searchParams.get('dir') ?? 'desc';

  let query = db.select().from(etfs).where(eq(etfs.isActive, true));

  if (pillar && pillar !== 'all') query = query.where(eq(etfs.pillar, pillar));
  if (grade && grade !== 'all')   query = query.where(eq(etfs.ytfGrade, grade));
  if (freq && freq !== 'all')     query = query.where(eq(etfs.dividendFrequency, freq));
  if (minYield > 0) query = query.where(gte(etfs.trailing12mYield, String(minYield / 100)));
  if (maxEr < 999)  query = query.where(lte(etfs.expenseRatio, String(maxEr / 100)));

  const results = await query
    .orderBy(dir === 'asc' ? asc(etfs[sort]) : desc(etfs[sort]))
    .limit(100);

  return Response.json(results);
}
```

### Stack Builder Calculator (No Auth Required)

The Stack Builder is a client-side only calculator — no API call needed. User picks ETFs, enters a dollar amount, and sees projected monthly income. All data needed is baked into the page at build time as a JSON island.

```typescript
// src/pages/stack-builder.astro
---
const etfData = await db.select({
  ticker: etfs.ticker,
  name: etfs.name,
  pillar: etfs.pillar,
  trailing12mYield: etfs.trailing12mYield,
  dividendFrequency: etfs.dividendFrequency,
  ytfGrade: etfs.ytfGrade,
  lastPrice: etfs.lastPrice,
}).from(etfs).where(eq(etfs.isActive, true));

const etfJson = JSON.stringify(etfData);
---

<script define:vars={{ etfJson }}>
  const etfs = JSON.parse(etfJson);
  // Client-side calculator logic
  // User selects ETFs + allocation % + total investment amount
  // Output: projected monthly income, pillar balance chart
</script>
```

### SEO Architecture

Every page uses a consistent SEO component with full JSON-LD schema markup.

```typescript
// src/components/layout/Seo.astro
---
interface Props {
  title: string;
  description: string;
  canonical?: string;
  schema?: object; // JSON-LD
  ogImage?: string;
}
---

<title>{title} | Yield to Freedom</title>
<meta name="description" content={description} />
<link rel="canonical" href={canonical ?? Astro.url.href} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={ogImage ?? '/og-default.png'} />
<meta name="twitter:card" content="summary_large_image" />
{schema && (
  <script type="application/ld+json" set:html={JSON.stringify(schema)} />
)}
```

ETF profile pages use `FinancialProduct` schema. Strategy pages use `Article` schema. The homepage uses `WebSite` + `Organization` schema.

### Disclaimer Component

Required on all ETF data pages and strategy pages. Renders as a dismissible banner and as a persistent footer note.

```typescript
// src/components/ui/Disclaimer.astro
// "The information on this site is for educational and research purposes only
//  and does not constitute financial advice. Yield to Freedom grades and
//  analysis are proprietary research tools, not investment recommendations.
//  Always consult a licensed financial advisor before making investment decisions."
```

---

## 10. Phase 2 — App Architecture

### Dashboard Data Model

The dashboard assembles multiple queries into a single user-facing view. Keep queries lean — do not join across all tables on every page load.

```typescript
// src/pages/app/index.astro (dashboard)

// Query 1: User settings and subscription status
const user = await getUserByClerkId(clerkUserId);

// Query 2: Holdings with ETF data joined
const holdings = await db
  .select({
    ticker: userHoldings.ticker,
    shares: userHoldings.shares,
    dripEnabled: userHoldings.dripEnabled,
    etfName: etfs.name,
    pillar: etfs.pillar,
    lastPrice: etfs.lastPrice,
    lastYield: etfs.trailing12mYield,
    ytfGrade: etfs.ytfGrade,
    dividendFrequency: etfs.dividendFrequency,
  })
  .from(userHoldings)
  .leftJoin(etfs, eq(userHoldings.etfId, etfs.id))
  .where(eq(userHoldings.userId, user.id));

// Computed in-memory (no extra DB query):
const totalValue = holdings.reduce((sum, h) =>
  sum + Number(h.shares) * Number(h.lastPrice ?? 0), 0);

const monthlyIncome = holdings.reduce((sum, h) => {
  const annualYield = Number(h.lastYield ?? 0);
  const positionValue = Number(h.shares) * Number(h.lastPrice ?? 0);
  return sum + (positionValue * annualYield / 12);
}, 0);

const pillarBreakdown = computePillarBreakdown(holdings);
const fiScore = user.monthlyExpenseTarget
  ? (monthlyIncome / Number(user.monthlyExpenseTarget)) * 100 : null;
```

### FI Score Calculation

```typescript
// src/lib/utils/finance.ts

export function computeFiScore(monthlyIncome: number, monthlyExpenseTarget: number): number {
  if (!monthlyExpenseTarget || monthlyExpenseTarget === 0) return 0;
  return Math.min(100, (monthlyIncome / monthlyExpenseTarget) * 100);
}

export function computeDripProjection(params: {
  holdings: { value: number; yield: number; frequency: string; dripEnabled: boolean }[];
  monthlyContribution: number;
  years: number;
}): { year: number; monthlyIncome: number; totalValue: number }[] {
  // Compound monthly. For DRIP-enabled holdings, reinvest distributions.
  // For non-DRIP, accumulate distributions separately.
  const results = [];
  let portfolio = params.holdings.map(h => ({ ...h }));
  let cashAccumulated = 0;

  for (let month = 1; month <= params.years * 12; month++) {
    let monthlyDist = 0;

    portfolio = portfolio.map(h => {
      const dist = h.value * h.yield / 12;
      if (h.dripEnabled) {
        h.value += dist; // reinvest
      } else {
        cashAccumulated += dist;
      }
      monthlyDist += dist;
      return h;
    });

    // Apply monthly contribution (split proportionally by current weights)
    const total = portfolio.reduce((s, h) => s + h.value, 0);
    portfolio = portfolio.map(h => ({
      ...h,
      value: h.value + params.monthlyContribution * (h.value / total),
    }));

    if (month % 12 === 0) {
      results.push({
        year: month / 12,
        monthlyIncome: monthlyDist,
        totalValue: portfolio.reduce((s, h) => s + h.value, 0) + cashAccumulated,
      });
    }
  }

  return results;
}

export function computeMarginPaydown(params: {
  marginBalance: number;
  marginRate: number; // e.g. 0.065
  monthlyIncome: number;
  monthlyAllocation: number; // how much of income to put toward margin
}): { month: number; remainingBalance: number; projectedDate: Date }[] {
  let balance = params.marginBalance;
  const results = [];
  let month = 0;

  while (balance > 0 && month < 360) {
    month++;
    const interest = balance * (params.marginRate / 12);
    balance = balance + interest - params.monthlyAllocation;
    if (balance < 0) balance = 0;

    results.push({
      month,
      remainingBalance: balance,
      projectedDate: new Date(Date.now() + month * 30 * 86400 * 1000),
    });
  }

  return results;
}
```

### Brokerage Sync Flow

```
User clicks "Connect Brokerage"
    │
    ▼
POST /api/brokerage/connect
    │ Registers user in SnapTrade (if not already)
    │ Generates Connection Portal URL
    ▼
Redirect to SnapTrade portal (user authenticates with their brokerage)
    │
    ▼
SnapTrade redirects back to /api/brokerage/callback
    │
    ▼
POST /api/portfolio/sync
    │ Fetch holdings from SnapTrade
    │ Match tickers to our etfs table
    │ Upsert into user_holdings
    ▼
Redirect to /app/portfolio (holdings now visible)
```

### Grade Alert Delivery

Grade alerts are generated by the weekly cron (Section 6.3) and delivered via a separate process:

```typescript
// src/pages/api/cron/send-alerts.ts
// Runs daily at 08:00 UTC — sends any pending grade alert emails
// vercel.json: { "schedule": "0 8 * * *" }

const pending = await db.select()
  .from(gradeAlerts)
  .leftJoin(users, eq(gradeAlerts.userId, users.id))
  .leftJoin(etfs, eq(gradeAlerts.etfId, etfs.id))
  .where(eq(gradeAlerts.emailSent, false));

for (const alert of pending) {
  if (!alert.users.emailAlerts) continue;

  await resend.emails.send({
    from: 'alerts@yieldtofreedom.com',
    to: alert.users.email,
    subject: `Grade Change: ${alert.etfs.ticker} ${alert.previousGrade} → ${alert.newGrade}`,
    html: gradeAlertEmailTemplate(alert),
  });

  await db.update(gradeAlerts)
    .set({ emailSent: true, alertedAt: new Date() })
    .where(eq(gradeAlerts.id, alert.id));
}
```

---

## 11. Payments & Subscriptions

### Subscription Tiers

| Feature | Free | Pro ($9/mo or $79/yr) |
|---|---|---|
| ETF directory + screener | Yes | Yes |
| Strategy pages | Yes | Yes |
| Stack Builder calculator | Yes | Yes |
| Portfolio dashboard | Limited (manual entry, 5 holdings max) | Full |
| Brokerage import (SnapTrade) | No | Yes |
| DRIP modeler | Basic (no save) | Full + saved scenarios |
| Margin timeline | No | Yes |
| FI Score | No | Yes |
| Dividend calendar | No | Yes |
| Grade change alerts | No | Yes |
| Data freshness | End of day | End of day (live in future roadmap) |

### Upgrade Flow

Free users see upgrade prompts on locked features. The CTA goes to `/app/settings?upgrade=true` which opens the Stripe checkout modal.

```typescript
// src/pages/api/stripe/checkout.ts
export async function POST({ request, locals }) {
  const clerkUserId = locals.auth().userId;
  const { priceId } = await request.json();

  const [user] = await db.select().from(users)
    .where(eq(users.clerkId, clerkUserId)).limit(1);

  const session = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${new URL(request.url).origin}/app?upgrade=success`,
    cancel_url: `${new URL(request.url).origin}/app/settings`,
    metadata: { userId: String(user.id) },
    subscription_data: {
      trial_period_days: 14, // 14-day free trial on first subscription
    },
  });

  return Response.json({ url: session.url });
}
```

---

## 12. Email & Notifications

### Email Templates

Four core emails needed at launch:

1. **Welcome** — triggered on first sign-up (Clerk webhook `user.created`)
2. **Grade Change Alert** — triggered by weekly cron when a held ETF changes grade
3. **Subscription Confirmation** — triggered by Stripe `customer.subscription.created`
4. **Subscription Lapse Warning** — triggered by Stripe `invoice.payment_failed`

All templates are plain HTML strings rendered server-side. No React Email dependency needed for v1.

### Newsletter (Loops.so)

- Loops.so connects to Resend as the sending infrastructure
- Email capture form on homepage, blog, and stack builder submits to `/api/subscribe`
- Double opt-in: confirmation email sent on subscribe, `confirmed = true` set on click
- Weekly newsletter: "This Week in Income ETFs" — manually written or semi-automated from blog posts

```typescript
// src/pages/api/subscribe.ts
export async function POST({ request }) {
  const { email, source } = await request.json();

  await db.insert(emailSubscribers)
    .values({ email, source })
    .onConflictDoNothing();

  // Send double opt-in confirmation via Resend
  await resend.emails.send({
    from: 'hello@yieldtofreedom.com',
    to: email,
    subject: 'Confirm your Yield to Freedom subscription',
    html: confirmationEmailTemplate({ email }),
  });

  return Response.json({ ok: true });
}
```

---

## 13. Deployment & CI/CD

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/sync-etfs",  "schedule": "0 2 * * *"   },
    { "path": "/api/cron/grade-etfs", "schedule": "0 3 * * 0"   },
    { "path": "/api/cron/send-alerts","schedule": "0 8 * * *"   }
  ],
  "functions": {
    "src/pages/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

### Astro Configuration

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import tailwind from '@astrojs/tailwind';
import clerk from '@clerk/astro';

export default defineConfig({
  output: 'hybrid',
  adapter: vercel({
    webAnalytics: { enabled: true },
    edgeMiddleware: true,     // Run Clerk auth check at edge
  }),
  integrations: [
    tailwind(),
    clerk(),
  ],
  vite: {
    ssr: {
      noExternal: ['@clerk/astro'],
    },
  },
});
```

### Environments

| Environment | Branch | URL | Neon Branch |
|---|---|---|---|
| Production | `main` | yieldtofreedom.com | `main` |
| Preview | `develop` | ytf-preview.vercel.app | `dev` (Neon branch) |
| Local | -- | localhost:4321 | `dev` (or local Docker Postgres) |

### Git Workflow

Simple two-branch workflow for solo development:
- `main` — production only. PR required, no direct pushes.
- `develop` — active development. Push freely, Vercel preview deploys on every push.
- Feature branches optional but recommended for anything touching the DB schema.

### Database Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply to dev Neon branch
DATABASE_URL=$DEV_DATABASE_URL npx drizzle-kit migrate

# Apply to production (after testing on dev)
DATABASE_URL=$PROD_DATABASE_URL npx drizzle-kit migrate
```

Never run migrations directly against production without testing on the dev Neon branch first. Neon branching makes this easy — dev branch is a copy of production schema.

---

## 14. Environment Variables

```bash
# .env.example — copy to .env and fill in

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

# Cron security
CRON_SECRET=a_long_random_string_32_chars_min

# App
PUBLIC_SITE_URL=https://yieldtofreedom.com
```

All `PUBLIC_` prefixed vars are exposed to the client. Everything else is server-only. Never commit `.env` — only `.env.example`.

---

## 15. Performance & SEO

### Core Web Vitals Targets

| Metric | Target | Strategy |
|---|---|---|
| LCP | < 2.5s | Static HTML, no client-side data fetching on ETF pages |
| CLS | < 0.1 | Reserve space for charts, avoid layout shifts from async loads |
| INP | < 200ms | Alpine.js for UI interactions, no heavy framework runtime |
| TTFB | < 600ms | Static pages served from CDN, SSR pages behind Vercel edge |

### Image Strategy

- ETF issuer logos: SVG where possible, PNG with explicit width/height otherwise
- OG images: pre-generated static PNGs per ETF page using `@vercel/og` or Satori
- No hero images on content pages — use CSS gradients instead

### Caching Strategy

```typescript
// ETF profile pages: revalidate every 24 hours (nightly sync)
export const headers = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
};

// API endpoints: no cache for user-specific data
export const headers = {
  'Cache-Control': 'private, no-store'
};

// Static assets: long cache
// Handled automatically by Vercel for /public/* assets
```

### Internal Linking Structure

The ETF directory functions as the hub. Every ETF profile links to:
- Relevant strategy pages (e.g. JEPI → `/strategy/covered-calls`)
- Related ETFs in the same pillar
- The compare tool pre-populated with that ticker
- The stack builder pre-populated with that ticker

Strategy pages link to 3-5 relevant ETF profiles each. Blog posts link to both strategy pages and ETF profiles. This creates a dense internal link graph that reinforces topical authority.

### Sitemap & robots.txt

```typescript
// src/pages/sitemap.xml.ts
// Auto-generate sitemap including all active ETF tickers
// Exclude /app/* routes (no-index for authenticated pages)
```

```
# public/robots.txt
User-agent: *
Disallow: /app/
Disallow: /api/
Allow: /

Sitemap: https://yieldtofreedom.com/sitemap.xml
```

---

## 16. Security Considerations

### API Route Protection

All `/api/*` routes that mutate data verify authentication:

```typescript
// Pattern for all authenticated API routes
const { userId } = Astro.locals.auth();
if (!userId) return new Response('Unauthorized', { status: 401 });
```

### Cron Endpoint Protection

All `/api/cron/*` endpoints verify a shared secret:

```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

Vercel Cron automatically passes `CRON_SECRET` as the Authorization header when configured in `vercel.json`.

### Stripe Webhook Verification

```typescript
const sig = request.headers.get('stripe-signature')!;
const event = stripe.webhooks.constructEvent(
  await request.text(),
  sig,
  import.meta.env.STRIPE_WEBHOOK_SECRET
);
// Never trust the event without this verification
```

### SnapTrade Security

- Store `snaptradeUserSecret` encrypted in the session (not in DB) or derive it per-request using a user-specific HMAC — SnapTrade's own recommendation
- All SnapTrade connections are read-only by default
- No brokerage credentials ever touch our servers

### Content Security Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{nonce}' https://js.stripe.com https://clerk.yieldtofreedom.com;
  frame-src https://js.stripe.com;
  connect-src 'self' https://api.clerk.dev https://financialmodelingprep.com;
  img-src 'self' data: https:;
```

### Financial Data Disclaimer

Required on every page that displays ETF data, grades, or financial projections:

> The information provided on Yield to Freedom is for educational and research purposes only. It does not constitute financial advice, investment recommendations, or a solicitation to buy or sell any security. YTF grades are proprietary research tools and reflect only the criteria defined in our methodology. Past performance is not indicative of future results. Always consult a licensed financial advisor before making investment decisions. Yield to Freedom is not a registered investment advisor.

---

## 17. Sprint-by-Sprint Build Plan

Estimated at 5-10 hours/week alongside Sallie Mae contract role.

### Sprint 1 — Foundation (Weeks 1-2)

- [ ] Astro project init with `hybrid` output, Tailwind v4, TypeScript strict
- [ ] Neon DB provisioned, dev branch created
- [ ] Drizzle schema written and first migration applied
- [ ] FMP API client built and tested against 5 tickers
- [ ] ETF universe seeded (75 ETFs with initial data)
- [ ] Nightly sync cron working locally (`tsx src/pages/api/cron/sync-etfs.ts`)
- [ ] Vercel project created, domain pointed, env vars set
- [ ] `develop` branch auto-deploys to preview URL
- [ ] Commercial FMP agreement initiated (do not wait — this takes time)

**Blocker:** FMP commercial agreement. Start this conversation on day 1.

### Sprint 2 — ETF Directory (Weeks 3-5)

- [ ] `/etfs` screener page with filter UI (pillar, grade, frequency, yield range)
- [ ] `/etfs/[ticker]` profile pages — static generation
- [ ] Grade algorithm implemented and run against full universe
- [ ] GradeChip, EtfCard, EtfTable components
- [ ] DividendChart component (Chart.js, last 24 payments)
- [ ] JSON-LD FinancialProduct schema on all ETF pages
- [ ] Disclaimer component in place on all ETF pages
- [ ] SEO: title templates, meta descriptions, canonical URLs

### Sprint 3 — Strategy Content (Weeks 6-7)

- [ ] Homepage — hero, pillar explainer, grade highlights, email capture CTA
- [ ] `/strategy` index page
- [ ] `/strategy/drip` — DRIP mechanics explainer
- [ ] `/strategy/margin` — margin arbitrage explainer
- [ ] `/strategy/fi-timeline` — FI timeline explainer
- [ ] `/about` — philosophy, disclaimer, creator background
- [ ] Lead magnet PDF: "Yield to Freedom Starter Guide" (brief, 8-10 pages)
- [ ] Email capture form → Resend + Loops.so pipeline

### Sprint 4 — Tools (Weeks 8-9)

- [ ] `/compare` — head-to-head ETF comparison (up to 3 ETFs)
- [ ] `/stack-builder` — no-auth income projection calculator
- [ ] Pillar balance visualization (pie chart via Chart.js)
- [ ] Monthly income breakdown by payment frequency

### Sprint 5 — Blog & SEO (Weeks 10-11)

- [ ] Blog setup with Astro content collections
- [ ] First 6 posts: income ETF overviews, DRIP explainer, SCHD vs JEPI, JEPI vs JEPQ, building the 40/30/30 stack, what is covered call income
- [ ] XML sitemap generation
- [ ] robots.txt
- [ ] Google Search Console connected
- [ ] Google Analytics 4 or Plausible
- [ ] AdSense application submitted

### Sprint 6 — Phase 1 Soft Launch (Week 12)

- [ ] Full Lighthouse audit (target 90+ on all metrics)
- [ ] Mobile responsiveness pass
- [ ] Accessibility audit (WCAG AA minimum)
- [ ] Load test ETF screener API endpoint
- [ ] DNS finalized, SSL confirmed
- [ ] Announcement posts: r/dividends, r/financialindependence, r/ETFs
- [ ] LinkedIn/Twitter/X launch post

### Sprint 7 — Phase 2 Foundation (Weeks 13-15)

- [ ] Clerk integration, auth middleware, `/login` page
- [ ] `users` table, Clerk webhook sync
- [ ] Stripe products created, checkout flow, webhook handler
- [ ] `/app` dashboard — basic layout, subscription gate
- [ ] Manual holding entry (free tier: 5 holdings max)
- [ ] Pillar breakdown chart from holdings

### Sprint 8 — Phase 2 Portfolio (Weeks 16-18)

- [ ] SnapTrade integration — connect brokerage, OAuth flow, holdings sync
- [ ] `/app/portfolio` — full holdings table, pillar balance, rebalancing gap
- [ ] FI Score calculation and display
- [ ] `/app/drip` — DRIP modeler with Chart.js projection chart

### Sprint 9 — Phase 2 Advanced Features (Weeks 19-21)

- [ ] `/app/margin` — margin paydown timeline
- [ ] `/app/calendar` — dividend calendar from held ETFs
- [ ] Grade change alert system — cron + email delivery
- [ ] `/app/alerts` — alert history view
- [ ] `/app/settings` — subscription management, brokerage connections, preferences

### Sprint 10 — Phase 2 Launch (Week 22)

- [ ] Stripe customer portal integration
- [ ] 14-day trial flow tested end-to-end
- [ ] Email sequences (welcome, trial ending, upgrade prompt)
- [ ] Product Hunt submission prepared
- [ ] Phase 2 launch announcement to email list

---

## 18. Open Questions & Decisions

The following must be resolved before or during Sprint 1:

### Critical (Before Sprint 1)

1. **FMP Commercial Agreement** — Contact FMP at `site.financialmodelingprep.com` to initiate a Data Display and Licensing Agreement. Get pricing for the commercial Build tier. This is the longest lead-time item in the entire project.

2. **Twelve Data as interim Phase 1 source** — Consider using Twelve Data ($29/mo, display-permissive) to power Phase 1 development while the FMP commercial deal is negotiated. Migrate to FMP once the agreement is in place. The FMP client wrapper in `src/lib/fmp/client.ts` can be swapped to Twelve Data with minimal changes.

3. **Domain purchase** — Register `yieldtofreedom.com` now. Point nameservers to Vercel. Set up `hello@yieldtofreedom.com` and `alerts@yieldtofreedom.com` in Resend for email sending.

### Before Sprint 2

4. **Initial ETF universe** — Finalize the curated list of ~75 ETFs to include at launch. Prioritize: well-known income ETFs (JEPI, JEPQ, SCHD, DIVO, QYLD), your personal holdings (TOPW, GOOW, NVII, IBIT), and ETFs that rank for target keywords.

5. **Grade algorithm weighting** — The weights in Section 7 are a starting proposal. Review and adjust before the first public grade display. Consider asking the r/dividends community for feedback after soft launch.

### Before Sprint 7

6. **Free tier limits** — Finalize what free users get in Phase 2. Current proposal: dashboard access with up to 5 manually-entered holdings, read-only DRIP modeler (no save), no brokerage import. Adjust based on Phase 1 user feedback.

7. **SnapTrade pricing confirmation** — Contact SnapTrade to confirm current pay-as-you-go rates for production use. Their pricing page shows unlimited API requests but brokerage connection sync costs vary.

8. **Pricing validation** — $9/mo is below-market for a portfolio tool of this depth. Consider $12/mo monthly, $99/yr annual. Validate against competitor pricing (Passiv, Snowball Analytics, Dividend Tracker Pro) before launch.

---

*Technical Blueprint v1.0 — Yield to Freedom / Creative Bandit LLC / May 2026*
*Stack: Astro 5 + Neon DB + Vercel + Drizzle + Clerk + Stripe + FMP + SnapTrade + Resend*
