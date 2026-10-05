import { randomBytes } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { customers, salons, services, staff, waitlistEntries, type Salon, type Service, type WaitlistEntry } from "@/db/schema";
import { BookingError, createBooking, getAvailability, getSalonBySlug, type CreateBookingResult, type Deps, type Slot } from "./booking";
import { clock, longDate, normalizePhone } from "./format";
import { sendSms } from "./sms";
import { isIsoDate, minutesToHhmm, toZoned } from "./time";

/** Så mange i køen får en SMS, når en tid bliver ledig. Den første der trykker, får tiden. */
export const OFFER_BATCH = 3;

export const PERIODS = {
  all: { label: "Hele dagen", fromMin: 0, toMin: 1440 },
  morning: { label: "Formiddag (før kl. 12)", fromMin: 0, toMin: 720 },
  afternoon: { label: "Eftermiddag (fra kl. 12)", fromMin: 720, toMin: 1440 },
} as const;
export type Period = keyof typeof PERIODS;

export function isPeriod(v: string): v is Period {
  return v in PERIODS;
}

export function periodLabel(entry: Pick<WaitlistEntry, "fromMin" | "toMin">): string {
  const p = Object.values(PERIODS).find((x) => x.fromMin === entry.fromMin && x.toMin === entry.toMin);
  return p ? p.label : `${minutesToHhmm(entry.fromMin)} til ${minutesToHhmm(entry.toMin)}`;
}

export type JoinWaitlistInput = {
  salonSlug: string;
  serviceId: number;
  staffId: number | null;
  date: string;
  period: Period;
  name: string;
  phone: string;
};

/** Skriver kunden på ventelisten for en dag. Står kunden der allerede til samme ydelse og dag, opdateres den eksisterende plads. */
export async function joinWaitlist(db: Db, input: JoinWaitlistInput, deps: Deps): Promise<WaitlistEntry> {
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
  if (input.staffId !== null) {
    const member = await db.query.staff.findFirst({
      where: and(eq(staff.id, input.staffId), eq(staff.salonId, salon.id), eq(staff.active, true)),
    });
    if (!member) throw new BookingError("Medarbejderen findes ikke.");
  }
  if (!isIsoDate(input.date)) throw new BookingError("Vælg en dag.");
  if (input.date < toZoned(deps.now, salon.timezone).date) throw new BookingError("Dagen er allerede gået.");

  const { fromMin, toMin } = PERIODS[input.period];
  const [customer] = await db
    .insert(customers)
    .values({ salonId: salon.id, name, phone })
    .onConflictDoUpdate({ target: [customers.salonId, customers.phone], set: { name } })
    .returning();

  const existing = await db.query.waitlistEntries.findFirst({
    where: and(
      eq(waitlistEntries.customerId, customer.id),
      eq(waitlistEntries.serviceId, service.id),
      eq(waitlistEntries.date, input.date),
      eq(waitlistEntries.status, "waiting"),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(waitlistEntries)
      .set({ staffId: input.staffId, fromMin, toMin })
      .where(eq(waitlistEntries.id, existing.id))
      .returning();
    return updated;
  }

  const [entry] = await db
    .insert(waitlistEntries)
    .values({
      salonId: salon.id,
      serviceId: service.id,
      staffId: input.staffId,
      customerId: customer.id,
      date: input.date,
      fromMin,
      toMin,
      token: randomBytes(18).toString("base64url"),
      createdAt: deps.now,
    })
    .returning();

  const first = name.split(" ")[0];
  await sendSms(
    db,
    {
      salonId: salon.id,
      to: phone,
      kind: "waitlist",
      body: `Hej ${first}. Du står på ventelisten hos ${salon.name} til ${service.name} ${longDate(input.date)}. Bliver en tid ledig, får du en SMS. Se eller afmeld: ${deps.appUrl}/venteliste/${entry.token}`,
    },
    deps.sms,
  );
  return entry;
}

/** Ledige tider lige nu, som passer til pladsen på ventelisten (dag, ydelse, frisør og tidsrum). */
export async function matchingSlots(db: Db, entry: WaitlistEntry, salon: Salon, service: Service, now: Date): Promise<Slot[]> {
  if (entry.status !== "waiting" || entry.date < toZoned(now, salon.timezone).date) return [];
  const slots = await getAvailability(db, { salon, service, staffId: entry.staffId, date: entry.date, now });
  return slots.filter((s) => {
    const min = toZoned(s.start, salon.timezone).minutes;
    return min >= entry.fromMin && min < entry.toMin;
  });
}

/**
 * Kaldes når en tid bliver ledig. De første i køen for dagen, som tiden passer til, får en SMS med et link.
 * Tiden holdes ikke, så den der først trykker book, får den. De andre bliver stående på ventelisten.
 * Med freed får kun dem en SMS, som den frigivne tid faktisk hjælper. Uden (salonen trykker selv) tilbydes alle ledige tider.
 */
export async function offerFreedTime(
  db: Db,
  salonId: number,
  date: string,
  deps: Deps,
  freed?: { staffId: number; startsAt: Date; endsAt: Date },
): Promise<number> {
  const salon = await db.query.salons.findFirst({ where: eq(salons.id, salonId) });
  if (!salon) return 0;
  const entries = await db
    .select({ entry: waitlistEntries, customer: customers, service: services })
    .from(waitlistEntries)
    .innerJoin(customers, eq(customers.id, waitlistEntries.customerId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .where(and(eq(waitlistEntries.salonId, salonId), eq(waitlistEntries.date, date), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));

  let offered = 0;
  for (const { entry, customer, service } of entries) {
    if (offered >= OFFER_BATCH) break;
    const slots = (await matchingSlots(db, entry, salon, service, deps.now)).filter(
      (sl) =>
        !freed ||
        (sl.staffIds.includes(freed.staffId) &&
          sl.start < freed.endsAt &&
          sl.start.getTime() + service.durationMin * 60000 > freed.startsAt.getTime()),
    );
    if (slots.length === 0) continue;
    const times = slots.slice(0, 3).map((s) => clock(s.start, salon.timezone));
    const more = slots.length > 3 ? " m.fl." : "";
    const first = customer.name.split(" ")[0];
    await sendSms(
      db,
      {
        salonId,
        to: customer.phone,
        kind: "waitlist_offer",
        body: `Hej ${first}. Der er blevet en tid ledig hos ${salon.name} ${longDate(date)} kl. ${times.join(", ")}${more} (${service.name}). Først til mølle, book her: ${deps.appUrl}/venteliste/${entry.token}`,
      },
      deps.sms,
    );
    await db.update(waitlistEntries).set({ lastOfferAt: deps.now }).where(eq(waitlistEntries.id, entry.id));
    offered++;
  }
  return offered;
}

export async function getWaitlistDetails(db: Db, token: string) {
  const entry = await db.query.waitlistEntries.findFirst({ where: eq(waitlistEntries.token, token) });
  if (!entry) return undefined;
  const [salon, service, member, customer] = await Promise.all([
    db.query.salons.findFirst({ where: eq(salons.id, entry.salonId) }),
    db.query.services.findFirst({ where: eq(services.id, entry.serviceId) }),
    entry.staffId ? db.query.staff.findFirst({ where: eq(staff.id, entry.staffId) }) : Promise.resolve(undefined),
    db.query.customers.findFirst({ where: eq(customers.id, entry.customerId) }),
  ]);
  return { entry, salon: salon!, service: service!, staff: member, customer: customer! };
}

/** Kunden booker en ledig tid fra sit ventelistelink. */
export async function bookFromWaitlist(db: Db, token: string, start: Date, deps: Deps): Promise<CreateBookingResult> {
  const d = await getWaitlistDetails(db, token);
  if (!d || d.entry.status !== "waiting") throw new BookingError("Du står ikke længere på ventelisten.");
  const slots = await matchingSlots(db, d.entry, d.salon, d.service, deps.now);
  if (!slots.some((s) => s.start.getTime() === start.getTime())) {
    throw new BookingError("Tiden er desværre lige blevet taget. Du står stadig på ventelisten.");
  }
  // createBooking markerer selv pladsen på ventelisten som brugt.
  return createBooking(
    db,
    {
      salonSlug: d.salon.slug,
      serviceId: d.service.id,
      staffId: d.entry.staffId,
      start,
      name: d.customer.name,
      phone: d.customer.phone,
    },
    deps,
  );
}

/** Når kunden har fået en tid, er pladsen på ventelisten for samme ydelse og dag ikke længere nødvendig. */
export async function closeWaitlistForBooking(
  db: Db,
  args: { customerId: number; serviceId: number; date: string; bookingId: number },
) {
  await db
    .update(waitlistEntries)
    .set({ status: "booked", bookingId: args.bookingId })
    .where(
      and(
        eq(waitlistEntries.customerId, args.customerId),
        eq(waitlistEntries.serviceId, args.serviceId),
        eq(waitlistEntries.date, args.date),
        eq(waitlistEntries.status, "waiting"),
      ),
    );
}

export async function leaveWaitlist(db: Db, where: { token: string } | { id: number; salonId: number }) {
  await db
    .update(waitlistEntries)
    .set({ status: "cancelled" })
    .where(
      and(
        "token" in where
          ? eq(waitlistEntries.token, where.token)
          : and(eq(waitlistEntries.id, where.id), eq(waitlistEntries.salonId, where.salonId)),
        eq(waitlistEntries.status, "waiting"),
      ),
    );
}

/** Ventelisten fra en given dag og frem, til salonens oversigt. */
export async function listWaitlist(db: Db, salonId: number, fromDate: string) {
  return db
    .select({ entry: waitlistEntries, customer: customers, service: services, staffName: staff.name })
    .from(waitlistEntries)
    .innerJoin(customers, eq(customers.id, waitlistEntries.customerId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .leftJoin(staff, eq(staff.id, waitlistEntries.staffId))
    .where(and(eq(waitlistEntries.salonId, salonId), eq(waitlistEntries.status, "waiting"), gte(waitlistEntries.date, fromDate)))
    .orderBy(asc(waitlistEntries.date), asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
}
