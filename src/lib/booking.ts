import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  bookings,
  customers,
  payments,
  salons,
  services,
  staff,
  workingHours,
  type Booking,
  type Salon,
  type Service,
  type Staff,
} from "@/db/schema";
import { computeSlots } from "./availability";
import { clock, kr, longDate, normalizePhone } from "./format";
import { getPaymentProvider, type PaymentProvider, type ProviderEvent } from "./payments";
import { getSmsProvider, sendSms, type SmsProvider } from "./sms";
import { addDays, fromZoned, toZoned, weekdayOf } from "./time";

/** Hvor længe en tid holdes til kunden, mens depositum betales. */
export const PAYMENT_HOLD_MIN = 15;

export type Deps = {
  now: Date;
  sms: SmsProvider;
  payments: PaymentProvider;
  appUrl: string;
};

export function defaultDeps(): Deps {
  return {
    now: new Date(),
    sms: getSmsProvider(),
    payments: getPaymentProvider(),
    appUrl: appUrl(),
  };
}

/** Offentlig adresse til links i SMS. Falder tilbage på Vercels produktionsdomæne, hvis APP_URL ikke er sat. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export class BookingError extends Error {}

/** Bookinger der optager tid i kalenderen. En ubetalt booking optager kun tid, mens den holdes. */
function blocksTime(now: Date) {
  return or(
    inArray(bookings.status, ["confirmed", "completed", "no_show"]),
    and(eq(bookings.status, "pending_payment"), gt(bookings.holdExpiresAt, now)),
  );
}

export async function getSalonBySlug(db: Db, slug: string): Promise<Salon | undefined> {
  return db.query.salons.findFirst({ where: eq(salons.slug, slug) });
}

export async function listServices(db: Db, salonId: number, onlyActive = true): Promise<Service[]> {
  return db.query.services.findMany({
    where: onlyActive ? and(eq(services.salonId, salonId), eq(services.active, true)) : eq(services.salonId, salonId),
    orderBy: asc(services.id),
  });
}

export async function listStaff(db: Db, salonId: number, onlyActive = true): Promise<Staff[]> {
  return db.query.staff.findMany({
    where: onlyActive ? and(eq(staff.salonId, salonId), eq(staff.active, true)) : eq(staff.salonId, salonId),
    orderBy: asc(staff.id),
  });
}

export type Slot = { start: Date; staffIds: number[] };

/**
 * Ledige tider for en ydelse på en dag. Med staffId = null samles alle medarbejderes tider,
 * og hver tid får en liste over hvem der kan tage den.
 */
export async function getAvailability(
  db: Db,
  args: { salon: Salon; service: Service; staffId: number | null; date: string; now: Date },
): Promise<Slot[]> {
  const { salon, service, date, now } = args;
  const team = (await listStaff(db, salon.id)).filter((s) => args.staffId === null || s.id === args.staffId);
  if (team.length === 0) return [];
  const ids = team.map((s) => s.id);

  const dayStart = fromZoned(date, 0, salon.timezone);
  const dayEnd = fromZoned(addDays(date, 1), 0, salon.timezone);

  const [hours, existing] = await Promise.all([
    db.select().from(workingHours).where(and(inArray(workingHours.staffId, ids), eq(workingHours.weekday, weekdayOf(date)))),
    db
      .select({ staffId: bookings.staffId, start: bookings.startsAt, end: bookings.endsAt })
      .from(bookings)
      .where(and(inArray(bookings.staffId, ids), lt(bookings.startsAt, dayEnd), gt(bookings.endsAt, dayStart), blocksTime(now))),
  ]);

  const byTime = new Map<number, number[]>();
  for (const member of team) {
    const slots = computeSlots({
      date,
      tz: salon.timezone,
      windows: hours.filter((h) => h.staffId === member.id),
      busy: existing.filter((b) => b.staffId === member.id),
      durationMin: service.durationMin,
      now,
    });
    for (const s of slots) {
      const list = byTime.get(s.getTime()) ?? [];
      list.push(member.id);
      byTime.set(s.getTime(), list);
    }
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([t, staffIds]) => ({ start: new Date(t), staffIds }));
}

export type CreateBookingInput = {
  salonSlug: string;
  serviceId: number;
  staffId: number | null;
  start: Date;
  name: string;
  phone: string;
  email?: string;
  note?: string;
};

export type CreateBookingResult = { booking: Booking; redirectUrl: string | null };

export async function createBooking(db: Db, input: CreateBookingInput, deps: Deps): Promise<CreateBookingResult> {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (name.length < 2) throw new BookingError("Skriv dit navn.");
  if (!phone) throw new BookingError("Telefonnummeret ser forkert ud. Skriv 8 cifre.");

  const salon = await getSalonBySlug(db, input.salonSlug);
  if (!salon) throw new BookingError("Salonen findes ikke.");
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.salonId, salon.id), eq(services.active, true)),
  });
  if (!service) throw new BookingError("Ydelsen findes ikke.");

  const date = toZoned(input.start, salon.timezone).date;
  const end = new Date(input.start.getTime() + service.durationMin * 60000);

  const booking = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const team = (await listStaff(t, salon.id)).filter((s) => input.staffId === null || s.id === input.staffId);
    if (team.length === 0) throw new BookingError("Medarbejderen findes ikke.");
    // Lås medarbejderne, så to kunder ikke kan få samme tid på samme tid.
    await tx
      .select({ id: staff.id })
      .from(staff)
      .where(inArray(staff.id, team.map((s) => s.id)))
      .for("update");

    const slots = await getAvailability(t, { salon, service, staffId: input.staffId, date, now: deps.now });
    const slot = slots.find((s) => s.start.getTime() === input.start.getTime());
    if (!slot) throw new BookingError("Tiden er desværre lige blevet taget. Vælg en anden tid.");
    const staffId = slot.staffIds[0];

    const [customer] = await tx
      .insert(customers)
      .values({ salonId: salon.id, name, phone, email: input.email?.trim() || null })
      .onConflictDoUpdate({
        target: [customers.salonId, customers.phone],
        set: { name, email: sql`coalesce(excluded.email, ${customers.email})` },
      })
      .returning();

    const needsDeposit = service.depositOre > 0;
    const [created] = await tx
      .insert(bookings)
      .values({
        salonId: salon.id,
        staffId,
        serviceId: service.id,
        customerId: customer.id,
        startsAt: input.start,
        endsAt: end,
        createdAt: deps.now,
        status: needsDeposit ? "pending_payment" : "confirmed",
        priceOre: service.priceOre,
        depositOre: service.depositOre,
        token: randomBytes(18).toString("base64url"),
        note: input.note?.trim() || null,
        holdExpiresAt: needsDeposit ? new Date(deps.now.getTime() + PAYMENT_HOLD_MIN * 60000) : null,
      })
      .returning();
    return created;
  });

  if (booking.status === "confirmed") {
    await sendBookingSms(db, booking.id, "confirmation", deps);
    return { booking, redirectUrl: null };
  }

  const reference = `bk${booking.id}-${randomBytes(6).toString("hex")}`;
  await db.insert(payments).values({
    reference,
    bookingId: booking.id,
    provider: deps.payments.name,
    amountOre: booking.depositOre,
    status: "created",
  });
  try {
    const { redirectUrl } = await deps.payments.createPayment({
      reference,
      amountOre: booking.depositOre,
      description: `Depositum: ${service.name} hos ${salon.name}`,
      returnUrl: `${deps.appUrl}/b/${booking.token}?ref=${encodeURIComponent(reference)}`,
      phone,
    });
    await db.update(payments).set({ redirectUrl, updatedAt: deps.now }).where(eq(payments.reference, reference));
    return { booking, redirectUrl };
  } catch (e) {
    // Frigiv tiden igen, hvis betalingen slet ikke kunne startes.
    await db.update(payments).set({ status: "failed", updatedAt: deps.now }).where(eq(payments.reference, reference));
    await db.update(bookings).set({ status: "expired" }).where(eq(bookings.id, booking.id));
    throw new BookingError("Betalingen kunne ikke startes. Prøv igen om lidt.", { cause: e });
  }
}

/**
 * Håndterer besked fra betalingsudbyderen (webhook eller mock-siden). Kan kaldes flere gange med samme besked.
 */
export async function handlePaymentEvent(db: Db, reference: string, event: ProviderEvent, deps: Deps): Promise<Booking | undefined> {
  const payment = await db.query.payments.findFirst({ where: eq(payments.reference, reference) });
  if (!payment) return undefined;
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, payment.bookingId) });
  if (!booking) return undefined;

  if (event !== "AUTHORIZED") {
    if (payment.status === "created") {
      await db.update(payments).set({ status: "failed", updatedAt: deps.now }).where(eq(payments.reference, reference));
    }
    if (booking.status === "pending_payment") {
      await db.update(bookings).set({ status: "expired" }).where(eq(bookings.id, booking.id));
    }
    return db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
  }

  if (payment.status !== "created") return booking; // allerede håndteret

  await db.update(payments).set({ status: "authorized", updatedAt: deps.now }).where(eq(payments.reference, reference));

  if (booking.status === "pending_payment" || booking.status === "expired") {
    // Kom betalingen efter holdetiden, er tiden måske givet til en anden imellemtiden.
    const clash = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.staffId, booking.staffId),
          sql`${bookings.id} <> ${booking.id}`,
          lt(bookings.startsAt, booking.endsAt),
          gt(bookings.endsAt, booking.startsAt),
          blocksTime(deps.now),
        ),
      );
    if (clash.length > 0) {
      await deps.payments.cancel(reference);
      await db.update(payments).set({ status: "cancelled", updatedAt: deps.now }).where(eq(payments.reference, reference));
      await db.update(bookings).set({ status: "expired" }).where(eq(bookings.id, booking.id));
    } else {
      await db.update(bookings).set({ status: "confirmed", holdExpiresAt: null }).where(eq(bookings.id, booking.id));
      await sendBookingSms(db, booking.id, "confirmation", deps);
    }
  }
  return db.query.bookings.findFirst({ where: eq(bookings.id, booking.id) });
}

async function activePayment(db: Db, bookingId: number) {
  return db.query.payments.findFirst({
    where: and(eq(payments.bookingId, bookingId), inArray(payments.status, ["authorized", "captured"])),
  });
}

/** Trækker depositum (salonen beholder det). */
async function captureDeposit(db: Db, bookingId: number, deps: Deps) {
  const p = await activePayment(db, bookingId);
  if (!p || p.status !== "authorized") return;
  await deps.payments.capture(p.reference, p.amountOre);
  await db.update(payments).set({ status: "captured", updatedAt: deps.now }).where(eq(payments.reference, p.reference));
}

/** Giver depositum tilbage til kunden. */
async function releaseDeposit(db: Db, bookingId: number, deps: Deps) {
  const p = await activePayment(db, bookingId);
  if (!p) return;
  if (p.status === "authorized") {
    await deps.payments.cancel(p.reference);
    await db.update(payments).set({ status: "cancelled", updatedAt: deps.now }).where(eq(payments.reference, p.reference));
  } else {
    await deps.payments.refund(p.reference, p.amountOre);
    await db.update(payments).set({ status: "refunded", updatedAt: deps.now }).where(eq(payments.reference, p.reference));
  }
}

/** Om kunden får depositum tilbage, hvis de aflyser nu. */
export function customerCanCancelFree(booking: Booking, salon: Salon, now: Date): boolean {
  return booking.startsAt.getTime() - now.getTime() >= salon.cancellationHours * 3600000;
}

export async function cancelBooking(
  db: Db,
  bookingId: number,
  by: "customer" | "salon",
  deps: Deps,
): Promise<{ depositReturned: boolean }> {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking || !["confirmed", "pending_payment"].includes(booking.status)) {
    throw new BookingError("Bookingen kan ikke aflyses.");
  }
  if (booking.startsAt <= deps.now) throw new BookingError("Tiden er allerede startet.");
  const salon = (await db.query.salons.findFirst({ where: eq(salons.id, booking.salonId) }))!;

  const free = by === "salon" || customerCanCancelFree(booking, salon, deps.now);
  if (free) await releaseDeposit(db, booking.id, deps);
  else await captureDeposit(db, booking.id, deps);

  await db.update(bookings).set({ status: "cancelled", cancelledAt: deps.now }).where(eq(bookings.id, booking.id));
  if (booking.status === "confirmed") await sendBookingSms(db, booking.id, "cancellation", deps);
  return { depositReturned: free };
}

/** Markér en tid som gennemført eller udeblevet. I begge tilfælde trækkes et reserveret depositum. */
export async function setOutcome(db: Db, bookingId: number, outcome: "completed" | "no_show", deps: Deps) {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking || !["confirmed", "completed", "no_show"].includes(booking.status)) {
    throw new BookingError("Bookingen kan ikke ændres.");
  }
  await captureDeposit(db, booking.id, deps);
  await db.update(bookings).set({ status: outcome }).where(eq(bookings.id, booking.id));
}

/**
 * Sender påmindelser for bekræftede tider de næste 24 timer.
 * Tider der er booket under 24 timer før, får ingen påmindelse, fordi bekræftelsen lige er kommet.
 * Køres hver time (se vercel.json eller npm run reminders).
 */
export async function sendDueReminders(db: Db, deps: Deps): Promise<number> {
  const horizon = new Date(deps.now.getTime() + 24 * 3600000);
  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminderSentAt),
        gt(bookings.startsAt, deps.now),
        lte(bookings.startsAt, horizon),
        lte(bookings.createdAt, sql`${bookings.startsAt} - interval '24 hours'`),
      ),
    );
  let sent = 0;
  for (const { id } of due) {
    // Markér først, så en dobbelt kørsel ikke sender to gange.
    const claimed = await db
      .update(bookings)
      .set({ reminderSentAt: deps.now })
      .where(and(eq(bookings.id, id), isNull(bookings.reminderSentAt)))
      .returning({ id: bookings.id });
    if (claimed.length === 0) continue;
    if (await sendBookingSms(db, id, "reminder", deps)) sent++;
  }
  return sent;
}

export async function getBookingDetails(db: Db, where: { id: number } | { token: string }) {
  const booking = await db.query.bookings.findFirst({
    where: "id" in where ? eq(bookings.id, where.id) : eq(bookings.token, where.token),
  });
  if (!booking) return undefined;
  const [salon, service, member, customer, payment] = await Promise.all([
    db.query.salons.findFirst({ where: eq(salons.id, booking.salonId) }),
    db.query.services.findFirst({ where: eq(services.id, booking.serviceId) }),
    db.query.staff.findFirst({ where: eq(staff.id, booking.staffId) }),
    db.query.customers.findFirst({ where: eq(customers.id, booking.customerId) }),
    db.query.payments.findFirst({ where: eq(payments.bookingId, booking.id), orderBy: (p, { desc }) => desc(p.createdAt) }),
  ]);
  return { booking, salon: salon!, service: service!, staff: member!, customer: customer!, payment };
}

export async function sendBookingSms(db: Db, bookingId: number, kind: "confirmation" | "reminder" | "cancellation", deps: Deps) {
  const d = await getBookingDetails(db, { id: bookingId });
  if (!d) return false;
  const tz = d.salon.timezone;
  const when = `${longDate(toZoned(d.booking.startsAt, tz).date)} kl. ${clock(d.booking.startsAt, tz)}`;
  const link = `${deps.appUrl}/b/${d.booking.token}`;
  const first = d.customer.name.split(" ")[0];
  const deposit = d.booking.depositOre > 0 ? ` Depositum på ${kr(d.booking.depositOre)} er reserveret.` : "";
  const body = {
    confirmation: `Hej ${first}. Din tid hos ${d.salon.name} er bekræftet: ${d.service.name} ${when} hos ${d.staff.name}.${deposit} Se eller aflys: ${link}`,
    reminder: `Hej ${first}. Husk din tid hos ${d.salon.name} ${when} (${d.service.name}). Kan du ikke komme, så aflys her: ${link}`,
    cancellation: `Hej ${first}. Din tid hos ${d.salon.name} ${when} er aflyst. Book en ny tid: ${deps.appUrl}/book/${d.salon.slug}`,
  }[kind];
  return sendSms(db, { salonId: d.salon.id, bookingId, to: d.customer.phone, body, kind }, deps.sms);
}

/** Alt til medarbejderkalenderen for én dag. */
export async function getDayCalendar(db: Db, salon: Salon, date: string) {
  const dayStart = fromZoned(date, 0, salon.timezone);
  const dayEnd = fromZoned(addDays(date, 1), 0, salon.timezone);
  const team = await listStaff(db, salon.id);
  const ids = team.map((s) => s.id);
  const [hours, rows] = await Promise.all([
    ids.length
      ? db.select().from(workingHours).where(and(inArray(workingHours.staffId, ids), eq(workingHours.weekday, weekdayOf(date))))
      : Promise.resolve([]),
    db
      .select({ booking: bookings, customer: customers, service: services })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(
        and(
          eq(bookings.salonId, salon.id),
          gte(bookings.startsAt, dayStart),
          lt(bookings.startsAt, dayEnd),
          inArray(bookings.status, ["confirmed", "completed", "no_show", "pending_payment", "cancelled"]),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
  ]);
  return { staff: team, hours, bookings: rows };
}
