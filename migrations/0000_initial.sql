CREATE TABLE "brokerage_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"snaptrade_user_id" varchar(100) NOT NULL,
	"snaptrade_account_id" varchar(100) NOT NULL,
	"brokerage_name" varchar(100),
	"account_name" varchar(200),
	"account_number" varchar(50),
	"status" varchar(20) DEFAULT 'active',
	"last_sync_at" timestamp,
	"sync_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"source" varchar(50),
	"confirmed" boolean DEFAULT false,
	"confirmed_at" timestamp,
	"unsubscribed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "email_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "etf_dividends" (
	"id" serial PRIMARY KEY NOT NULL,
	"etf_id" integer NOT NULL,
	"ex_date" date NOT NULL,
	"payment_date" date,
	"declared_date" date,
	"record_date" date,
	"amount" numeric(10, 6) NOT NULL,
	"yield_at_payment" numeric(6, 4),
	"adj_amount" numeric(10, 6),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "etf_grade_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"etf_id" integer NOT NULL,
	"grade" varchar(2) NOT NULL,
	"score" numeric(5, 2),
	"graded_at" timestamp DEFAULT now(),
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "etf_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"etf_id" integer NOT NULL,
	"date" date NOT NULL,
	"open" numeric(10, 4),
	"high" numeric(10, 4),
	"low" numeric(10, 4),
	"close" numeric(10, 4) NOT NULL,
	"adj_close" numeric(10, 4),
	"volume" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "etfs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"pillar" varchar(20) NOT NULL,
	"category" varchar(50),
	"issuer" varchar(100),
	"last_price" numeric(10, 4),
	"last_yield" numeric(6, 4),
	"trailing_12m_yield" numeric(6, 4),
	"expense_ratio" numeric(6, 4),
	"aum" numeric(18, 2),
	"dividend_frequency" varchar(20),
	"drip_eligible" boolean DEFAULT false,
	"income_synthetic" boolean DEFAULT false,
	"ytf_grade" varchar(2),
	"ytf_score" numeric(5, 2),
	"grade_updated_at" timestamp,
	"return_1y" numeric(8, 4),
	"return_3y" numeric(8, 4),
	"return_5y" numeric(8, 4),
	"inception_date" date,
	"exchange" varchar(10),
	"fmp_last_synced" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "etfs_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "grade_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"etf_id" integer NOT NULL,
	"previous_grade" varchar(2),
	"new_grade" varchar(2),
	"alerted_at" timestamp,
	"email_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"etf_id" integer,
	"brokerage_connection_id" integer,
	"ticker" varchar(10) NOT NULL,
	"shares" numeric(14, 6) NOT NULL,
	"avg_cost_basis" numeric(10, 4),
	"drip_enabled" boolean DEFAULT false,
	"is_manual" boolean DEFAULT false,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"subscription_tier" varchar(20) DEFAULT 'free',
	"subscription_status" varchar(20) DEFAULT 'inactive',
	"stripe_customer_id" varchar(100),
	"stripe_sub_id" varchar(100),
	"current_period_end" timestamp,
	"target_income_alloc" numeric(5, 2) DEFAULT '40.00',
	"target_stability_alloc" numeric(5, 2) DEFAULT '30.00',
	"target_growth_alloc" numeric(5, 2) DEFAULT '30.00',
	"monthly_expense_target" numeric(10, 2),
	"margin_balance" numeric(12, 2) DEFAULT '0',
	"margin_rate" numeric(5, 4),
	"timezone" varchar(60) DEFAULT 'America/New_York',
	"email_alerts" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "brokerage_connections" ADD CONSTRAINT "brokerage_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_dividends" ADD CONSTRAINT "etf_dividends_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_grade_history" ADD CONSTRAINT "etf_grade_history_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_prices" ADD CONSTRAINT "etf_prices_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_alerts" ADD CONSTRAINT "grade_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_alerts" ADD CONSTRAINT "grade_alerts_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_holdings" ADD CONSTRAINT "user_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_holdings" ADD CONSTRAINT "user_holdings_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_holdings" ADD CONSTRAINT "user_holdings_brokerage_connection_id_brokerage_connections_id_fk" FOREIGN KEY ("brokerage_connection_id") REFERENCES "public"."brokerage_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brokerage_connections_user_idx" ON "brokerage_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brokerage_connections_account_idx" ON "brokerage_connections" USING btree ("snaptrade_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "etf_dividends_etf_date_idx" ON "etf_dividends" USING btree ("etf_id","ex_date");--> statement-breakpoint
CREATE INDEX "etf_dividends_etf_id_idx" ON "etf_dividends" USING btree ("etf_id");--> statement-breakpoint
CREATE INDEX "etf_dividends_ex_date_idx" ON "etf_dividends" USING btree ("ex_date");--> statement-breakpoint
CREATE UNIQUE INDEX "etf_prices_etf_date_idx" ON "etf_prices" USING btree ("etf_id","date");--> statement-breakpoint
CREATE INDEX "etf_prices_etf_id_idx" ON "etf_prices" USING btree ("etf_id");--> statement-breakpoint
CREATE INDEX "etf_prices_date_idx" ON "etf_prices" USING btree ("date");--> statement-breakpoint
CREATE INDEX "etfs_pillar_idx" ON "etfs" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "etfs_grade_idx" ON "etfs" USING btree ("ytf_grade");--> statement-breakpoint
CREATE INDEX "user_holdings_user_idx" ON "user_holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_holdings_user_etf_idx" ON "user_holdings" USING btree ("user_id","ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");