import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { bookings, payments, smsMessages, type Salon } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import {
  BookingError,
  cancelBooking,
  createBooking,
  getAvailability,
  handlePaymentEvent,
  listServices,
  sendDueReminders,
  setOutcome,
  type Deps,
} from "@/lib/booking";
import type { PaymentProvider } from "@/lib/payments";
import { fromZoned } from "@/lib/time";

const TZ = "Europe/Copenhagen";
// Tirsdag 6. oktober 2026. Mette, Ali og Sofie arbejder ikke alle samme dage (se seed).
const DAY = "2026-10-06";

let db: Db;
let salon: Salon;
let calls: string[];
let deps: Deps;

function makeDeps(now: Date): Deps {
  const provider: PaymentProvider = {
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
  };
  return { now, appUrl: "https://app.example", payments: provider, sms: { name: "test", async send() {} } };
}

async function service(name: string) {
  return (await listServices(db, salon.id)).find((s) => s.name === name)!;
}

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  salon = await seedDemo(db);
  calls = [];
  deps = makeDeps(new Date("2026-10-01T08:00:00Z"));
});

describe("booking", () => {
  it("bekræfter en tid uden depositum med det samme og sender SMS", async () => {
    const herreklip = await service("Herreklip");
    const start = fromZoned(DAY, 10 * 60, TZ);
    const { booking, redirectUrl } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: null, start, name: "Jens Hansen", phone: "22334455" },
      deps,
    );
    expect(redirectUrl).toBeNull();
    expect(booking.status).toBe("confirmed");
    const sms = await db.select().from(smsMessages);
    expect(sms).toHaveLength(1);
    expect(sms[0].to).toBe("+4522334455");
    expect(sms[0].body).toContain("tirsdag d. 6. oktober kl. 10:00");
  });

  it("forhindrer dobbeltbooking af samme medarbejder", async () => {
    const herreklip = await service("Herreklip");
    const start = fromZoned(DAY, 9 * 60, TZ);
    const mette = (await db.query.staff.findFirst({ where: (s, { eq }) => eq(s.name, "Mette") }))!;
    const input = { salonSlug: "demo", serviceId: herreklip.id, staffId: mette.id, start, name: "A B", phone: "11111111" };
    await createBooking(db, input, deps);
    await expect(createBooking(db, { ...input, phone: "22222222" }, deps)).rejects.toBeInstanceOf(BookingError);
  });

  it("vælger en anden ledig frisør ved 'første ledige'", async () => {
    const herreklip = await service("Herreklip");
    const start = fromZoned(DAY, 10 * 60, TZ);
    const a = await createBooking(db, { salonSlug: "demo", serviceId: herreklip.id, staffId: null, start, name: "A A", phone: "11111111" }, deps);
    const b = await createBooking(db, { salonSlug: "demo", serviceId: herreklip.id, staffId: null, start, name: "B B", phone: "22222222" }, deps);
    expect(a.booking.staffId).not.toBe(b.booking.staffId);
  });

  it("holder tiden mens depositum betales og bekræfter når MobilePay godkender", async () => {
    const farve = await service("Farve og klip");
    const start = fromZoned(DAY, 10 * 60, TZ);
    const { booking, redirectUrl } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: farve.id, staffId: null, start, name: "Lise", phone: "33333333" },
      deps,
    );
    expect(booking.status).toBe("pending_payment");
    expect(redirectUrl).toMatch(/^https:\/\/pay\.example\//);

    // Tiden er optaget for den medarbejder, mens den holdes.
    const slots = await getAvailability(db, { salon, service: farve, staffId: booking.staffId, date: DAY, now: deps.now });
    expect(slots.some((s) => s.start.getTime() === start.getTime())).toBe(false);

    const [p] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
    const confirmed = await handlePaymentEvent(db, p.reference, "AUTHORIZED", deps);
    expect(confirmed?.status).toBe("confirmed");
    // Samme besked to gange giver ikke to SMS'er.
    await handlePaymentEvent(db, p.reference, "AUTHORIZED", deps);
    expect(await db.select().from(smsMessages)).toHaveLength(1);
  });

  it("frigiver tiden når holdetiden udløber", async () => {
    const farve = await service("Farve og klip");
    const start = fromZoned(DAY, 10 * 60, TZ);
    const { booking } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: farve.id, staffId: null, start, name: "Lise", phone: "33333333" },
      deps,
    );
    const later = new Date(deps.now.getTime() + 16 * 60000);
    const slots = await getAvailability(db, { salon, service: farve, staffId: booking.staffId, date: DAY, now: later });
    expect(slots.some((s) => s.start.getTime() === start.getTime())).toBe(true);
  });

  it("afviser sen betaling hvis tiden er givet væk og frigiver beløbet", async () => {
    const farve = await service("Farve og klip");
    const start = fromZoned(DAY, 10 * 60, TZ);
    const first = await createBooking(db, { salonSlug: "demo", serviceId: farve.id, staffId: null, start, name: "Lise", phone: "33333333" }, deps);
    const later = makeDeps(new Date(deps.now.getTime() + 20 * 60000));
    const herreklip = await service("Herreklip");
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: first.booking.staffId, start, name: "Ole", phone: "44444444" },
      later,
    );
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, first.booking.id));
    const result = await handlePaymentEvent(db, p.reference, "AUTHORIZED", later);
    expect(result?.status).toBe("expired");
    expect(calls).toContain(`cancel ${p.reference}`);
  });

  it("giver depositum tilbage ved rettidig aflysning og beholder det ved sen", async () => {
    const farve = await service("Farve og klip");
    const book = async (min: number, phone: string) => {
      const r = await createBooking(
        db,
        { salonSlug: "demo", serviceId: farve.id, staffId: null, start: fromZoned(DAY, min, TZ), name: "Karen", phone },
        deps,
      );
      const [p] = await db.select().from(payments).where(eq(payments.bookingId, r.booking.id));
      await handlePaymentEvent(db, p.reference, "AUTHORIZED", deps);
      return { id: r.booking.id, ref: p.reference };
    };
    const early = await book(9 * 60, "55555555");
    const late = await book(12 * 60, "66666666");

    expect(await cancelBooking(db, early.id, "customer", deps)).toEqual({ depositReturned: true });
    expect(calls).toContain(`cancel ${early.ref}`);

    const dayBefore = makeDeps(fromZoned("2026-10-05", 18 * 60, TZ));
    expect(await cancelBooking(db, late.id, "customer", dayBefore)).toEqual({ depositReturned: false });
    expect(calls).toContain(`capture ${late.ref}`);
  });

  it("trækker depositum ved udeblivelse", async () => {
    const dame = await service("Dameklip");
    const r = await createBooking(
      db,
      { salonSlug: "demo", serviceId: dame.id, staffId: null, start: fromZoned(DAY, 9 * 60, TZ), name: "Karen", phone: "77777777" },
      deps,
    );
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, r.booking.id));
    await handlePaymentEvent(db, p.reference, "AUTHORIZED", deps);
    await setOutcome(db, r.booking.id, "no_show", deps);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, r.booking.id));
    expect(b.status).toBe("no_show");
    expect(calls).toContain(`capture ${p.reference}`);
  });

  it("sender én påmindelse dagen før", async () => {
    const herreklip = await service("Herreklip");
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: null, start: fromZoned(DAY, 10 * 60, TZ), name: "Jens", phone: "88888888" },
      deps,
    );
    expect(await sendDueReminders(db, makeDeps(fromZoned("2026-10-04", 12 * 60, TZ)))).toBe(0);
    const dayBefore = makeDeps(fromZoned("2026-10-05", 11 * 60, TZ));
    expect(await sendDueReminders(db, dayBefore)).toBe(1);
    expect(await sendDueReminders(db, dayBefore)).toBe(0);
    const sms = await db.select().from(smsMessages).where(eq(smsMessages.kind, "reminder"));
    expect(sms).toHaveLength(1);
  });
});
