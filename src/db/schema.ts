import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const salons = pgTable("salons", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Europe/Copenhagen"),
  // Hvor mange timer før en tid kunden kan aflyse og få depositum retur.
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salons.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

// Faste arbejdstider pr. ugedag. weekday: 1 = mandag ... 7 = søndag. Minutter efter midnat i salonens tidszone.
export const workingHours = pgTable(
  "working_hours",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("working_hours_staff_idx").on(t.staffId, t.weekday)],
);

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salons.id),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull(),
  priceOre: integer("price_ore").notNull(),
  depositOre: integer("deposit_ore").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id").notNull().references(() => salons.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_salon_phone_idx").on(t.salonId, t.phone)],
);

export const BOOKING_STATUSES = [
  "pending_payment", // venter på MobilePay-depositum, holder tiden indtil holdExpiresAt
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
  "expired", // betaling blev ikke gennemført i tide
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id").notNull().references(() => salons.id),
    staffId: integer("staff_id").notNull().references(() => staff.id),
    serviceId: integer("service_id").notNull().references(() => services.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").$type<BookingStatus>().notNull(),
    priceOre: integer("price_ore").notNull(),
    depositOre: integer("deposit_ore").notNull().default(0),
    // Hemmeligt token til kundens link (se, aflys). Kunden behøver ikke login.
    token: text("token").notNull().unique(),
    note: text("note"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_staff_time_idx").on(t.staffId, t.startsAt),
    index("bookings_salon_time_idx").on(t.salonId, t.startsAt),
  ],
);

export const PAYMENT_STATUSES = [
  "created",
  "authorized", // beløbet er reserveret på kundens konto
  "captured", // salonen har trukket beløbet
  "cancelled", // reservationen er frigivet
  "refunded",
  "failed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const payments = pgTable("payments", {
  // Vores reference, som også sendes til MobilePay.
  reference: text("reference").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookings.id),
  provider: text("provider").notNull(),
  amountOre: integer("amount_ore").notNull(),
  status: text("status").$type<PaymentStatus>().notNull(),
  redirectUrl: text("redirect_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const smsMessages = pgTable("sms_messages", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id").notNull().references(() => salons.id),
  bookingId: integer("booking_id").references(() => bookings.id),
  to: text("to").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Salon = typeof salons.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
