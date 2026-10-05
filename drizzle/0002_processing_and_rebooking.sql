ALTER TABLE "bookings" ADD COLUMN "processing_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "processing_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rebook_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rebook_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "processing_after_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "processing_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "rebook_weeks" integer;