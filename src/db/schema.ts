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

export const DEPOSIT_MODES = ["always", "no_show"] as const;
export type DepositMode = (typeof DEPOSIT_MODES)[number];

export const salons = pgTable("salons", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Europe/Copenhagen"),
  // Hvor mange timer før en tid kunden kan aflyse og få depositum retur.
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  // "always": ydelsens depositum kræves af alle. "no_show": kun af kunder der er udeblevet mindst depositAfterNoShows gange.
  depositMode: text("deposit_mode").$type<DepositMode>().notNull().default("always"),
  depositAfterNoShows: integer("deposit_after_no_shows").notNull().default(1),
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
  // Virketid, fx mens farven sidder. Frisøren arbejder processingAfterMin minutter, så er hun fri i processingMin minutter
  // og kan tage en anden kunde imens, og så arbejder hun resten af tiden. 0 = ingen virketid.
  processingAfterMin: integer("processing_after_min").notNull().default(0),
  processingMin: integer("processing_min").notNull().default(0),
  // Hvor mange uger der typisk går til næste besøg. Bruges til genbooking, når kunden ikke har en fast rytme endnu.
  rebookWeeks: integer("rebook_weeks"),
  active: boolean("active").notNull().default(true),
});

export const DEPOSIT_OVERRIDES = ["always", "never"] as const;
export type DepositOverride = (typeof DEPOSIT_OVERRIDES)[number];

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id").notNull().references(() => salons.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    // Salonens egne noter, fx farveformel. Kan komme med fra import.
    note: text("note"),
    // Kunden har sagt ja til en SMS, når det er tid til næste besøg. SMS-markedsføring kræver samtykke.
    rebookOptIn: boolean("rebook_opt_in").notNull().default(false),
    rebookRemindedAt: timestamp("rebook_reminded_at", { withTimezone: true }),
    // Salonens valg for netop denne kunde. null = følg salonens regel.
    depositOverride: text("deposit_override").$type<DepositOverride>(),
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
    // Virketid inden for bookingen, hvor frisøren er fri til en anden kunde. Kopieret fra ydelsen ved booking.
    processingStartsAt: timestamp("processing_starts_at", { withTimezone: true }),
    processingEndsAt: timestamp("processing_ends_at", { withTimezone: true }),
    status: text("status").$type<BookingStatus>().notNull(),
    priceOre: integer("price_ore").notNull(),
    depositOre: integer("deposit_ore").notNull().default(0),
    // Hemmeligt token til kundens link (se, aflys). Kunden behøver ikke login.
    token: text("token").notNull().unique(),
    note: text("note"),
    // Salonens egen note om besøget, fx farveformel eller hvad der blev klippet. Vises i kundens historik.
    visitNote: text("visit_note"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Sidste gang kunden selv flyttede tiden.
    rescheduledAt: timestamp("rescheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_customer_idx").on(t.customerId),
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

export const WAITLIST_STATUSES = [
  "waiting",
  "booked", // fik en tid via ventelisten
  "cancelled", // kunden eller salonen fjernede den
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/**
 * Kunder der gerne vil have en tid på en bestemt dag, som er fuldt booket.
 * Bliver en tid ledig (fx ved aflysning), får de første i køen en SMS med et link, hvor de kan booke den.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id").notNull().references(() => salons.id),
    serviceId: integer("service_id").notNull().references(() => services.id),
    // null = alle frisører er fine.
    staffId: integer("staff_id").references(() => staff.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    // Dagen i salonens tidszone (YYYY-MM-DD) og et tidsrum i minutter efter midnat.
    date: text("date").notNull(),
    fromMin: integer("from_min").notNull().default(0),
    toMin: integer("to_min").notNull().default(1440),
    status: text("status").$type<WaitlistStatus>().notNull().default("waiting"),
    // Hemmeligt token til kundens link, ligesom på bookinger.
    token: text("token").notNull().unique(),
    bookingId: integer("booking_id").references(() => bookings.id),
    lastOfferAt: timestamp("last_offer_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("waitlist_salon_date_idx").on(t.salonId, t.date, t.status)],
);

export type Salon = typeof salons.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
