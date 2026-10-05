ALTER TABLE "bookings" ADD COLUMN "visit_note" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deposit_override" text;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "deposit_mode" text DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "deposit_after_no_shows" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");