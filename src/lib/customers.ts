import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, customers } from "@/db/schema";

/** Kundekartoteket med nøgletal. Salonen ejer sine kunder og kan altid eksportere dem. */
export async function listCustomers(db: Db, salonId: number) {
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
    .where(eq(customers.salonId, salonId))
    .groupBy(customers.id)
    .orderBy(desc(customers.createdAt));
}

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semikolon og BOM, så filen åbner rigtigt i dansk Excel.
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
