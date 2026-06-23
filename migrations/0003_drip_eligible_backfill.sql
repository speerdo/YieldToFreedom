-- drip_eligible: flip default to true and backfill existing rows.
-- Income/distributing ETFs are DRIP-eligible at major brokerages; only
-- non-distributing products (Bitcoin ETFs, ARKK-style growth funds) are not.
-- Eligibility is derived from dividend_frequency text and the presence of
-- any recorded dividends, so the column reflects reality without manual upkeep.
ALTER TABLE "etfs" ALTER COLUMN "drip_eligible" SET DEFAULT true;--> statement-breakpoint
UPDATE "etfs"
   SET "drip_eligible" = ("dividend_frequency" IS NOT NULL AND "dividend_frequency" <> 'n/a');--> statement-breakpoint
UPDATE "etfs" e SET "drip_eligible" = TRUE
WHERE EXISTS (SELECT 1 FROM "etf_dividends" d WHERE d."etf_id" = e."id");--> statement-breakpoint
-- descriptions columns (idempotent guards in case 0002 was already applied).
ALTER TABLE "etfs" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "etfs" ADD COLUMN IF NOT EXISTS "holdings_json" jsonb;--> statement-breakpoint
ALTER TABLE "etfs" ADD COLUMN IF NOT EXISTS "sector_weights_json" jsonb;