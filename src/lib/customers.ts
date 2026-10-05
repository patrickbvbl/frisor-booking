import { and, asc, desc, eq, ilike, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, customers, services, staff, type DepositOverride } from "@/db/schema";

/**
 * Søgning på navn, e-mail eller telefon. Telefon matches på cifrene, så "22 33 44" finder +4522334455.
 * Flere ord skal alle passe, så "anne jen" finder Anne Jensen.
 */
export function customerSearch(query: string): SQL | undefined {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return undefined;
  const digits = query.replace(/\D/g, "");
  const textMatch = and(
    ...words.map((w) => {
      const like = `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return or(ilike(customers.name, like), ilike(customers.email, like));
    }),
  );
  // Et nummer skrives tit med mellemrum, så cifrene samles og søges for sig.
  return digits.length >= 3 ? or(textMatch, sql`${customers.phone} like ${`%${digits}%`}`) : textMatch;
}

/** Kundekartoteket med nøgletal. Salonen ejer sine kunder og kan altid eksportere dem. */
export async function listCustomers(db: Db, salonId: number, query = "") {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      note: customers.note,
      createdAt: customers.createdAt,
      visits: sql<number>`count(*) filter (where ${bookings.status} = 'completed')`.mapWith(Number),
      noShows: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')`.mapWith(Number),
      lastVisit: sql<Date | null>`max(${bookings.startsAt}) filter (where ${bookings.status} in ('completed', 'confirmed'))`.mapWith(
        (v) => (v ? new Date(v) : null),
      ),
    })
    .from(customers)
    .leftJoin(bookings, eq(bookings.customerId, customers.id))
    .where(and(eq(customers.salonId, salonId), customerSearch(query)))
    .groupBy(customers.id)
    .orderBy(desc(customers.createdAt));
}

export async function countCustomers(db: Db, salonId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(customers)
    .where(eq(customers.salonId, salonId));
  return row?.n ?? 0;
}

/** Hurtigsøgning til at vælge en kunde, fx når salonen opretter en booking. */
export async function findCustomers(db: Db, salonId: number, query: string, limit = 8) {
  const where = customerSearch(query);
  if (!where) return [];
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
    .from(customers)
    .where(and(eq(customers.salonId, salonId), where))
    .orderBy(asc(customers.name))
    .limit(limit);
}

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semikolon og BOM, så filen åbner rigtigt i dansk Excel.
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

/** Alt til kundekortet: kunden, alle tider med ydelse og frisør (nyeste først) og nøgletal. */
export async function getCustomerCard(db: Db, salonId: number, customerId: number) {
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.salonId, salonId)) });
  if (!customer) return undefined;
  const history = await db
    .select({ booking: bookings, serviceName: services.name, staffName: staff.name, staffId: staff.id })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(and(eq(bookings.customerId, customer.id), sql`${bookings.status} <> 'expired'`))
    .orderBy(desc(bookings.startsAt));

  const done = history.filter((h) => h.booking.status === "completed");
  const byStaff = new Map<string, number>();
  for (const h of done) byStaff.set(h.staffName, (byStaff.get(h.staffName) ?? 0) + 1);
  const favourite = [...byStaff.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    customer,
    history,
    stats: {
      visits: done.length,
      noShows: history.filter((h) => h.booking.status === "no_show").length,
      spentOre: done.reduce((sum, h) => sum + h.booking.priceOre, 0),
      favouriteStaff: favourite,
      lastVisit: done[0]?.booking.startsAt ?? null,
    },
  };
}

export async function updateCustomer(
  db: Db,
  salonId: number,
  customerId: number,
  values: { name: string; email: string | null; note: string | null; depositOverride: DepositOverride | null },
) {
  await db
    .update(customers)
    .set(values)
    .where(and(eq(customers.id, customerId), eq(customers.salonId, salonId)));
}

/** Salonens note om et besøg, fx farveformel. Følger med i kundens historik. */
export async function setVisitNote(db: Db, salonId: number, bookingId: number, note: string) {
  await db
    .update(bookings)
    .set({ visitNote: note.trim() || null })
    .where(and(eq(bookings.id, bookingId), eq(bookings.salonId, salonId)));
}

/** Seneste note om et tidligere besøg, så frisøren kan se hvad der blev lavet sidst. */
export async function lastVisitNote(db: Db, customerId: number, before: Date) {
  const [row] = await db
    .select({ note: bookings.visitNote, startsAt: bookings.startsAt, serviceName: services.name })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, "completed"),
        isNotNull(bookings.visitNote),
        lt(bookings.startsAt, before),
      ),
    )
    .orderBy(desc(bookings.startsAt))
    .limit(1);
  return row;
}
