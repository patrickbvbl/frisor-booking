CREATE TABLE "waitlist_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"salon_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"staff_id" integer,
	"customer_id" integer NOT NULL,
	"date" text NOT NULL,
	"from_min" integer DEFAULT 0 NOT NULL,
	"to_min" integer DEFAULT 1440 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"token" text NOT NULL,
	"booking_id" integer,
	"last_offer_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_salon_date_idx" ON "waitlist_entries" USING btree ("salon_id","date","status");