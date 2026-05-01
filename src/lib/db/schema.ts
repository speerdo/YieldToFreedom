import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── ETF UNIVERSE ─────────────────────────────────────────────────────────────

export const etfs = pgTable(
  'etfs',
  {
    id: serial('id').primaryKey(),
    ticker: varchar('ticker', { length: 10 }).notNull().unique(),
    name: text('name').notNull(),
    pillar: varchar('pillar', { length: 20 }).notNull(),
    category: varchar('category', { length: 50 }),
    issuer: varchar('issuer', { length: 100 }),
    lastPrice: decimal('last_price', { precision: 10, scale: 4 }),
    lastYield: decimal('last_yield', { precision: 6, scale: 4 }),
    trailing12mYield: decimal('trailing_12m_yield', { precision: 6, scale: 4 }),
    expenseRatio: decimal('expense_ratio', { precision: 6, scale: 4 }),
    aum: decimal('aum', { precision: 18, scale: 2 }),
    dividendFrequency: varchar('dividend_frequency', { length: 20 }),
    dripEligible: boolean('drip_eligible').default(false),
    incomeSynthetic: boolean('income_synthetic').default(false),
    ytfGrade: varchar('ytf_grade', { length: 2 }),
    ytfScore: decimal('ytf_score', { precision: 5, scale: 2 }),
    gradeUpdatedAt: timestamp('grade_updated_at'),
    return1y: decimal('return_1y', { precision: 8, scale: 4 }),
    return3y: decimal('return_3y', { precision: 8, scale: 4 }),
    return5y: decimal('return_5y', { precision: 8, scale: 4 }),
    inceptionDate: date('inception_date'),
    exchange: varchar('exchange', { length: 10 }),
    fmpLastSynced: timestamp('fmp_last_synced'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('etfs_pillar_idx').on(t.pillar),
    index('etfs_grade_idx').on(t.ytfGrade),
  ],
);

// ─── DIVIDEND HISTORY ─────────────────────────────────────────────────────────

export const etfDividends = pgTable(
  'etf_dividends',
  {
    id: serial('id').primaryKey(),
    etfId: integer('etf_id')
      .notNull()
      .references(() => etfs.id, { onDelete: 'cascade' }),
    exDate: date('ex_date').notNull(),
    paymentDate: date('payment_date'),
    declaredDate: date('declared_date'),
    recordDate: date('record_date'),
    amount: decimal('amount', { precision: 10, scale: 6 }).notNull(),
    yieldAtPayment: decimal('yield_at_payment', { precision: 6, scale: 4 }),
    adjAmount: decimal('adj_amount', { precision: 10, scale: 6 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('etf_dividends_etf_date_idx').on(t.etfId, t.exDate),
    index('etf_dividends_etf_id_idx').on(t.etfId),
    index('etf_dividends_ex_date_idx').on(t.exDate),
  ],
);

// ─── PRICE HISTORY ────────────────────────────────────────────────────────────

export const etfPrices = pgTable(
  'etf_prices',
  {
    id: serial('id').primaryKey(),
    etfId: integer('etf_id')
      .notNull()
      .references(() => etfs.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    open: decimal('open', { precision: 10, scale: 4 }),
    high: decimal('high', { precision: 10, scale: 4 }),
    low: decimal('low', { precision: 10, scale: 4 }),
    close: decimal('close', { precision: 10, scale: 4 }).notNull(),
    adjClose: decimal('adj_close', { precision: 10, scale: 4 }),
    volume: integer('volume'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('etf_prices_etf_date_idx').on(t.etfId, t.date),
    index('etf_prices_etf_id_idx').on(t.etfId),
    index('etf_prices_date_idx').on(t.date),
  ],
);

// ─── GRADE HISTORY ────────────────────────────────────────────────────────────

export const etfGradeHistory = pgTable('etf_grade_history', {
  id: serial('id').primaryKey(),
  etfId: integer('etf_id')
    .notNull()
    .references(() => etfs.id, { onDelete: 'cascade' }),
  grade: varchar('grade', { length: 2 }).notNull(),
  score: decimal('score', { precision: 5, scale: 2 }),
  gradedAt: timestamp('graded_at').defaultNow(),
  reason: text('reason'),
});

// ─── USERS ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    clerkId: varchar('clerk_id', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free'),
    subscriptionStatus: varchar('subscription_status', { length: 20 }).default('inactive'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
    stripeSubId: varchar('stripe_sub_id', { length: 100 }),
    currentPeriodEnd: timestamp('current_period_end'),
    targetIncomeAlloc: decimal('target_income_alloc', { precision: 5, scale: 2 }).default('40.00'),
    targetStabilityAlloc: decimal('target_stability_alloc', { precision: 5, scale: 2 }).default(
      '30.00',
    ),
    targetGrowthAlloc: decimal('target_growth_alloc', { precision: 5, scale: 2 }).default(
      '30.00',
    ),
    monthlyExpenseTarget: decimal('monthly_expense_target', { precision: 10, scale: 2 }),
    marginBalance: decimal('margin_balance', { precision: 12, scale: 2 }).default('0'),
    marginRate: decimal('margin_rate', { precision: 5, scale: 4 }),
    timezone: varchar('timezone', { length: 60 }).default('America/New_York'),
    emailAlerts: boolean('email_alerts').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('users_clerk_id_idx').on(t.clerkId),
    index('users_email_idx').on(t.email),
  ],
);

// ─── BROKERAGE CONNECTIONS ────────────────────────────────────────────────────

export const brokerageConnections = pgTable(
  'brokerage_connections',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snaptradeUserId: varchar('snaptrade_user_id', { length: 100 }).notNull(),
    snaptradeAccountId: varchar('snaptrade_account_id', { length: 100 }).notNull(),
    brokerageName: varchar('brokerage_name', { length: 100 }),
    accountName: varchar('account_name', { length: 200 }),
    accountNumber: varchar('account_number', { length: 50 }),
    status: varchar('status', { length: 20 }).default('active'),
    lastSyncAt: timestamp('last_sync_at'),
    syncError: text('sync_error'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('brokerage_connections_user_idx').on(t.userId),
    uniqueIndex('brokerage_connections_account_idx').on(t.snaptradeAccountId),
  ],
);

// ─── USER HOLDINGS ────────────────────────────────────────────────────────────

export const userHoldings = pgTable(
  'user_holdings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    etfId: integer('etf_id').references(() => etfs.id),
    brokerageConnectionId: integer('brokerage_connection_id').references(() => brokerageConnections.id),
    ticker: varchar('ticker', { length: 10 }).notNull(),
    shares: decimal('shares', { precision: 14, scale: 6 }).notNull(),
    avgCostBasis: decimal('avg_cost_basis', { precision: 10, scale: 4 }),
    dripEnabled: boolean('drip_enabled').default(false),
    isManual: boolean('is_manual').default(false),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('user_holdings_user_idx').on(t.userId),
    index('user_holdings_user_etf_idx').on(t.userId, t.ticker),
  ],
);

// ─── EMAIL SUBSCRIBERS ────────────────────────────────────────────────────────

export const emailSubscribers = pgTable(
  'email_subscribers',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    source: varchar('source', { length: 50 }),
    verificationToken: varchar('verification_token', { length: 64 }),
    confirmed: boolean('confirmed').default(false),
    confirmedAt: timestamp('confirmed_at'),
    unsubscribed: boolean('unsubscribed').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('email_subscribers_verification_token_idx').on(t.verificationToken)],
);

// ─── GRADE ALERTS ─────────────────────────────────────────────────────────────

export const gradeAlerts = pgTable('grade_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  etfId: integer('etf_id')
    .notNull()
    .references(() => etfs.id),
  previousGrade: varchar('previous_grade', { length: 2 }),
  newGrade: varchar('new_grade', { length: 2 }),
  alertedAt: timestamp('alerted_at'),
  emailSent: boolean('email_sent').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
