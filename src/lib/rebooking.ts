import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, customers, salons, services } from "@/db/schema";
import type { Deps } from "./booking";
import { sendSms } from "./sms";

/**
 * Genbooking: "Det er 6 uger siden sidst, skal vi finde en tid?".
 * Intervallet er kundens egen rytme ud fra tidligere besøg. Har kunden ikke en rytme endnu, bruges ydelsens typiske interval.
 * Der sendes kun til kunder, der har sagt ja til det, og kun én gang pr. besøg.
 */

const DAY = 86400000;
export const MIN_INTERVAL_DAYS = 14;
export const MAX_INTERVAL_DAYS = 180;
/** Er kunden mere end så mange dage over tiden, sender vi ikke. Så får gamle kunder ikke en SMS, når funktionen slås til. */
export const MAX_OVERDUE_DAYS = 30;

/** Kundens rytme i dage: medianen af afstanden mellem besøg. Besøg under en uge fra hinanden tæller som ét. */
export function rhythmDays(visits: Date[]): number | null {
  const sorted = [...visits].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = (sorted[i].getTime() - sorted[i - 1].getTime()) / DAY;
    if (days >= 7) gaps.push(days);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.round(Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, median)));
}

export type RebookPlan = {
  customerId: number;
  name: string;
  phone: string;
  optIn: boolean;
  remindedAt: Date | null;
  lastVisit: Date;
  lastBookingToken: string;
  serviceId: number;
  staffId: number;
  intervalDays: number;
  source: "rytme" | "ydelse";
  dueAt: Date;
  hasFutureBooking: boolean;
};

/** Hvornår hver kunde med gennemførte besøg bør komme igen. Kunder uden rytme og uden interval på ydelsen er ikke med. */
export async function rebookPlans(db: Db, salonId: number, now: Date): Promise<RebookPlan[]> {
  const [visits, future] = await Promise.all([
    db
      .select({ booking: bookings, customer: customers, rebookWeeks: services.rebookWeeks })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(and(eq(bookings.salonId, salonId), eq(bookings.status, "completed")))
      .orderBy(asc(bookings.startsAt)),
    db
      .selectDistinct({ customerId: bookings.customerId })
      .from(bookings)
      .where(and(eq(bookings.salonId, salonId), inArray(bookings.status, ["confirmed", "pending_payment"]), gt(bookings.startsAt, now))),
  ]);
  const hasFuture = new Set(future.map((f) => f.customerId));

  const byCustomer = new Map<number, typeof visits>();
  for (const v of visits) byCustomer.set(v.customer.id, [...(byCustomer.get(v.customer.id) ?? []), v]);

  const plans: RebookPlan[] = [];
  for (const list of byCustomer.values()) {
    const last = list[list.length - 1];
    const rhythm = rhythmDays(list.map((v) => v.booking.startsAt));
    const intervalDays = rhythm ?? (last.rebookWeeks ? last.rebookWeeks * 7 : null);
    if (!intervalDays) continue;
    plans.push({
      customerId: last.customer.id,
      name: last.customer.name,
      phone: last.customer.phone,
      optIn: last.customer.rebookOptIn,
      remindedAt: last.customer.rebookRemindedAt,
      lastVisit: last.booking.startsAt,
      lastBookingToken: last.booking.token,
      serviceId: last.booking.serviceId,
      staffId: last.booking.staffId,
      intervalDays,
      source: rhythm ? "rytme" : "ydelse",
      dueAt: new Date(last.booking.startsAt.getTime() + intervalDays * DAY),
      hasFutureBooking: hasFuture.has(last.customer.id),
    });
  }
  return plans.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export function shouldRemind(p: RebookPlan, now: Date): boolean {
  return (
    p.optIn &&
    !p.hasFutureBooking &&
    p.dueAt <= now &&
    now.getTime() - p.dueAt.getTime() <= MAX_OVERDUE_DAYS * DAY &&
    (!p.remindedAt || p.remindedAt < p.lastVisit)
  );
}

/** Kører én gang om dagen sammen med påmindelserne. Kan køres flere gange uden dobbelte SMS'er. */
export async function sendRebookReminders(db: Db, deps: Deps): Promise<number> {
  const all = await db.select().from(salons);
  let sent = 0;
  for (const salon of all) {
    for (const p of await rebookPlans(db, salon.id, deps.now)) {
      if (!shouldRemind(p, deps.now)) continue;
      const claimed = await db
        .update(customers)
        .set({ rebookRemindedAt: deps.now })
        .where(and(eq(customers.id, p.customerId), eq(customers.rebookOptIn, true)))
        .returning({ id: customers.id });
      if (claimed.length === 0) continue;
      const weeks = Math.max(1, Math.round((deps.now.getTime() - p.lastVisit.getTime()) / (7 * DAY)));
      const first = p.name.split(" ")[0];
      const ok = await sendSms(
        db,
        {
          salonId: salon.id,
          to: p.phone,
          kind: "rebook",
          body: `Hej ${first}. Det er ${weeks} uger siden, du var hos ${salon.name}. Skal vi finde en ny tid? Book her: ${deps.appUrl}/b/${p.lastBookingToken}`,
        },
        deps.sms,
      );
      if (ok) sent++;
    }
  }
  return sent;
}

export async function setRebookOptIn(db: Db, customerId: number, optIn: boolean) {
  await db.update(customers).set({ rebookOptIn: optIn }).where(eq(customers.id, customerId));
}
