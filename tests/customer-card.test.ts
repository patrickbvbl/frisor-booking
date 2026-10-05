import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { bookings, customers, salons, smsMessages, staff, type Salon } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import {
  BookingError,
  createBooking,
  customerCanReschedule,
  depositRequired,
  getAvailability,
  listServices,
  rescheduleBooking,
  setOutcome,
  type Deps,
} from "@/lib/booking";
import { getCustomerCard, lastVisitNote, setVisitNote, updateCustomer } from "@/lib/customers";
import { joinWaitlist } from "@/lib/waitlist";
import { fromZoned } from "@/lib/time";

const TZ = "Europe/Copenhagen";
// Tirsdag og onsdag i uge 41. Mette og Ali arbejder om tirsdagen.
const DAY = "2026-10-06";
const NEXT = "2026-10-07";

let db: Db;
let salon: Salon;
let deps: Deps;
let calls: string[];

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  salon = await seedDemo(db);
  calls = [];
  deps = {
    now: new Date("2026-10-01T08:00:00Z"),
    appUrl: "https://app.example",
    sms: { name: "test", async send() {} },
    payments: {
      name: "test",
      async createPayment({ reference }) {
        calls.push(`create ${reference}`);
        return { redirectUrl: `https://pay.example/${reference}` };
      },
      async capture(ref) {
        calls.push(`capture ${ref}`);
      },
      async cancel(ref) {
        calls.push(`cancel ${ref}`);
      },
      async refund(ref) {
        calls.push(`refund ${ref}`);
      },
    },
  };
});

async function service(name: string) {
  return (await listServices(db, salon.id)).find((s) => s.name === name)!;
}

async function member(name: string) {
  return (await db.query.staff.findFirst({ where: eq(staff.name, name) }))!;
}

async function book(serviceName: string, date: string, min: number, phone = "22334455", staffId: number | null = null) {
  const s = await service(serviceName);
  return createBooking(
    db,
    { salonSlug: "demo", serviceId: s.id, staffId, start: fromZoned(date, min, TZ), name: "Jens Hansen", phone },
    deps,
  );
}

describe("depositum kun for dem der udebliver", () => {
  it("følger reglen og salonens valg for den enkelte kunde", () => {
    const service = { depositOre: 10000 };
    const always = { depositMode: "always" as const, depositAfterNoShows: 1 };
    const noShow = { depositMode: "no_show" as const, depositAfterNoShows: 2 };
    expect(depositRequired({ service, salon: always, customer: null, noShows: 0 })).toBe(true);
    expect(depositRequired({ service, salon: noShow, customer: null, noShows: 1 })).toBe(false);
    expect(depositRequired({ service, salon: noShow, customer: null, noShows: 2 })).toBe(true);
    expect(depositRequired({ service, salon: noShow, customer: { depositOverride: "always" }, noShows: 0 })).toBe(true);
    expect(depositRequired({ service, salon: always, customer: { depositOverride: "never" }, noShows: 5 })).toBe(false);
    expect(depositRequired({ service: { depositOre: 0 }, salon: always, customer: { depositOverride: "always" }, noShows: 5 })).toBe(false);
  });

  it("lader nye og trofaste kunder booke uden depositum og kræver det efter en udeblivelse", async () => {
    await db.update(salons).set({ depositMode: "no_show", depositAfterNoShows: 1 }).where(eq(salons.id, salon.id));

    const first = await book("Dameklip", DAY, 10 * 60);
    expect(first.booking.status).toBe("confirmed");
    expect(first.booking.depositOre).toBe(0);
    expect(first.redirectUrl).toBeNull();

    await setOutcome(db, first.booking.id, "no_show", deps);

    const second = await book("Dameklip", NEXT, 10 * 60);
    expect(second.booking.status).toBe("pending_payment");
    expect(second.booking.depositOre).toBe(10000);
    expect(second.redirectUrl).toMatch(/^https:\/\/pay\.example\//);
  });

  it("lader salonen tilgive en kunde", async () => {
    await db.update(salons).set({ depositMode: "no_show" }).where(eq(salons.id, salon.id));
    const first = await book("Dameklip", DAY, 10 * 60);
    await setOutcome(db, first.booking.id, "no_show", deps);
    await updateCustomer(db, salon.id, first.booking.customerId, { name: "Jens Hansen", email: null, note: null, depositOverride: "never" });

    const second = await book("Dameklip", NEXT, 10 * 60);
    expect(second.booking.status).toBe("confirmed");
    expect(second.booking.depositOre).toBe(0);
  });
});

describe("kunden flytter selv sin tid", () => {
  it("flytter tiden, beholder frisør og link og sender en SMS", async () => {
    const mette = await member("Mette");
    const { booking } = await book("Herreklip", DAY, 10 * 60, "22334455", mette.id);
    const start = fromZoned(DAY, 13 * 60, TZ);

    const moved = await rescheduleBooking(db, booking.id, { start, staffId: mette.id }, deps);
    expect(moved.startsAt).toEqual(start);
    expect(moved.staffId).toBe(mette.id);
    expect(moved.token).toBe(booking.token);
    expect(moved.rescheduledAt).toEqual(deps.now);

    const sms = await db.select().from(smsMessages).where(eq(smsMessages.kind, "rescheduled"));
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain("flyttet til tirsdag d. 6. oktober kl. 13:00");

    // Den gamle tid er ledig igen.
    const slots = await getAvailability(db, { salon, service: await service("Herreklip"), staffId: mette.id, date: DAY, now: deps.now });
    expect(slots.some((s) => s.start.getTime() === fromZoned(DAY, 10 * 60, TZ).getTime())).toBe(true);
  });

  it("kan flytte et kvarter, selvom den nye tid overlapper den gamle", async () => {
    const mette = await member("Mette");
    const { booking } = await book("Herreklip", DAY, 10 * 60, "22334455", mette.id);
    const moved = await rescheduleBooking(db, booking.id, { start: fromZoned(DAY, 10 * 60 + 15, TZ), staffId: mette.id }, deps);
    expect(moved.startsAt).toEqual(fromZoned(DAY, 10 * 60 + 15, TZ));
  });

  it("afviser en tid, der er taget", async () => {
    const mette = await member("Mette");
    const { booking } = await book("Herreklip", DAY, 10 * 60, "22334455", mette.id);
    await book("Herreklip", DAY, 13 * 60, "99887766", mette.id);
    await expect(rescheduleBooking(db, booking.id, { start: fromZoned(DAY, 13 * 60, TZ), staffId: mette.id }, deps)).rejects.toBeInstanceOf(
      BookingError,
    );
  });

  it("kan ikke flyttes inden for aflysningsfristen", async () => {
    const { booking } = await book("Herreklip", DAY, 10 * 60);
    const late = { ...deps, now: new Date(booking.startsAt.getTime() - 3 * 3600000) };
    expect(customerCanReschedule(booking, salon, late.now)).toBe(false);
    await expect(rescheduleBooking(db, booking.id, { start: fromZoned(NEXT, 10 * 60, TZ), staffId: null }, late)).rejects.toThrow(
      /Ring til salonen/,
    );
  });

  it("beholder depositum, når tiden flyttes", async () => {
    const { booking } = await book("Dameklip", DAY, 10 * 60);
    // Depositum betales, så tiden bliver bekræftet.
    await db.update(bookings).set({ status: "confirmed", holdExpiresAt: null }).where(eq(bookings.id, booking.id));
    const moved = await rescheduleBooking(db, booking.id, { start: fromZoned(NEXT, 11 * 60, TZ), staffId: null }, deps);
    expect(moved.depositOre).toBe(10000);
    expect(calls.filter((c) => c.startsWith("cancel") || c.startsWith("refund"))).toEqual([]);
  });

  it("tilbyder den gamle tid til ventelisten", async () => {
    const mette = await member("Mette");
    const ali = await member("Ali");
    const herreklip = await service("Herreklip");
    // Fyld dagen, så en anden kunde må på ventelisten.
    const { booking } = await book("Herreklip", DAY, 10 * 60, "22334455", mette.id);
    await db.update(staff).set({ active: false }).where(eq(staff.id, ali.id));
    await joinWaitlist(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: mette.id, date: DAY, period: "morning", name: "Ventende Vera", phone: "44556677" },
      deps,
    );
    await rescheduleBooking(db, booking.id, { start: fromZoned(DAY, 15 * 60, TZ), staffId: mette.id }, deps);
    const offers = await db.select().from(smsMessages).where(eq(smsMessages.kind, "waitlist_offer"));
    expect(offers).toHaveLength(1);
    expect(offers[0].to).toBe("+4544556677");
  });
});

describe("kundekort", () => {
  it("viser historik, nøgletal og salonens noter", async () => {
    const a = await book("Herreklip", DAY, 10 * 60);
    const b = await book("Skægtrim", NEXT, 10 * 60);
    await setOutcome(db, a.booking.id, "completed", deps);
    await setOutcome(db, b.booking.id, "no_show", deps);
    await setVisitNote(db, salon.id, a.booking.id, "  Maskine 3 i siderne  ");

    const card = (await getCustomerCard(db, salon.id, a.booking.customerId))!;
    expect(card.history.map((h) => h.serviceName)).toEqual(["Skægtrim", "Herreklip"]);
    expect(card.history[1].booking.visitNote).toBe("Maskine 3 i siderne");
    expect(card.stats).toMatchObject({ visits: 1, noShows: 1, spentOre: 32500 });
    expect(card.stats.favouriteStaff).toBeTruthy();
  });

  it("viser ikke kunder fra en anden salon", async () => {
    const a = await book("Herreklip", DAY, 10 * 60);
    expect(await getCustomerCard(db, salon.id + 1, a.booking.customerId)).toBeUndefined();
    await setVisitNote(db, salon.id + 1, a.booking.id, "Hack");
    const [row] = await db.select().from(bookings).where(eq(bookings.id, a.booking.id));
    expect(row.visitNote).toBeNull();
    const [c] = await db.select().from(customers).where(eq(customers.id, a.booking.customerId));
    expect(c.depositOverride).toBeNull();
  });
});

describe("seneste besøgsnote", () => {
  it("viser noten fra sidste gennemførte besøg før tiden", async () => {
    const a = await book("Herreklip", DAY, 10 * 60);
    const b = await book("Herreklip", NEXT, 10 * 60);
    await setOutcome(db, a.booking.id, "completed", deps);
    await setVisitNote(db, salon.id, a.booking.id, "Saks på toppen");
    expect((await lastVisitNote(db, a.booking.customerId, b.booking.startsAt))?.note).toBe("Saks på toppen");
    expect(await lastVisitNote(db, a.booking.customerId, a.booking.startsAt)).toBeUndefined();
  });
});
