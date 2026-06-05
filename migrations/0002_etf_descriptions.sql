ALTER TABLE "etfs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "etfs" ADD COLUMN "holdings_json" jsonb;--> statement-breakpoint
ALTER TABLE "etfs" ADD COLUMN "sector_weights_json" jsonb;
