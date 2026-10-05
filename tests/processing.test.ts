import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import type { Salon, Service, Staff } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { serviceSegments } from "@/lib/availability";
import { createBooking, getAvailability, handlePaymentEvent, listServices, type Deps } from "@/lib/booking";
import { payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fromZoned } from "@/lib/time";

const TZ = "Europe/Copenhagen";
const DAY = "2026-10-06";
const at = (h: number, m = 0) => fromZoned(DAY, h * 60 + m, TZ);

let db: Db;
let salon: Salon;
let deps: Deps;
let mette: Staff;
let farve: Service;
let herreklip: Service;

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  salon = await seedDemo(db);
  deps = {
    now: new Date("2026-10-01T08:00:00Z"),
    appUrl: "https://app.example",
    sms: { name: "test", async send() {} },
    payments: {
      name: "test",
      async createPayment() {
        return { redirectUrl: "https://pay.example" };
      },
      async capture() {},
      async cancel() {},
      async refund() {},
    },
  };
  mette = (await db.query.staff.findFirst({ where: (s, { eq }) => eq(s.name, "Mette") }))!;
  const all = await listServices(db, salon.id);
  farve = all.find((s) => s.name === "Farve og klip")!;
  herreklip = all.find((s) => s.name === "Herreklip")!;
});

async function bookFarveAt9() {
  const r = await createBooking(
    db,
    { salonSlug: "demo", serviceId: farve.id, staffId: mette.id, start: at(9), name: "Farve Kunde", phone: "11111111" },
    deps,
  );
  const [p] = await db.select().from(payments).where(eq(payments.bookingId, r.booking.id));
  await handlePaymentEvent(db, p.reference, "AUTHORIZED", deps);
  return r.booking;
}

const times = (slots: { start: Date }[]) => slots.map((s) => s.start.getTime());

describe("farve med virketid", () => {
  it("deler ydelsen i arbejde, virketid og arbejde", () => {
    expect(serviceSegments(farve)).toEqual([
      { offsetMin: 0, durationMin: 30 },
      { offsetMin: 75, durationMin: 45 },
    ]);
    expect(serviceSegments({ durationMin: 60, processingAfterMin: 30, processingMin: 30 })).toEqual([{ offsetMin: 0, durationMin: 60 }]);
    expect(serviceSegments({ durationMin: 60, processingAfterMin: 0, processingMin: 20 })).toEqual([{ offsetMin: 0, durationMin: 60 }]);
  });

  it("gemmer virketiden på bookingen", async () => {
    const b = await bookFarveAt9();
    expect(b.processingStartsAt).toEqual(at(9, 30));
    expect(b.processingEndsAt).toEqual(at(10, 15));
  });

  it("lader frisøren tage en anden kunde, mens farven virker", async () => {
    await bookFarveAt9();
    const slots = times(await getAvailability(db, { salon, service: herreklip, staffId: mette.id, date: DAY, now: deps.now }));
    // Herreklip på 30 min passer ind fra 9:30 til 10:15.
    expect(slots).toContain(at(9, 30).getTime());
    expect(slots).toContain(at(9, 45).getTime());
    expect(slots).not.toContain(at(9).getTime());
    expect(slots).not.toContain(at(10).getTime()); // ville slutte 10:30, hvor farven skal skylles
    expect(slots).not.toContain(at(10, 30).getTime());
    expect(slots).toContain(at(11).getTime());

    const { booking } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: mette.id, start: at(9, 30), name: "Klip Kunde", phone: "22222222" },
      deps,
    );
    expect(booking.status).toBe("confirmed");
    expect(booking.staffId).toBe(mette.id);
  });

  it("kan lægge en farve, så en anden kunde allerede sidder i dens virketid", async () => {
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: mette.id, start: at(9, 30), name: "Klip Kunde", phone: "22222222" },
      deps,
    );
    const slots = times(await getAvailability(db, { salon, service: farve, staffId: mette.id, date: DAY, now: deps.now }));
    expect(slots).toContain(at(9).getTime());
    expect(slots).not.toContain(at(9, 15).getTime());
  });

  it("godkender en sen betaling, når den anden kunde sidder i virketiden", async () => {
    const r = await createBooking(
      db,
      { salonSlug: "demo", serviceId: farve.id, staffId: mette.id, start: at(9), name: "Farve Kunde", phone: "11111111" },
      deps,
    );
    const later = { ...deps, now: new Date(deps.now.getTime() + 20 * 60000) };
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklip.id, staffId: mette.id, start: at(9, 30), name: "Klip Kunde", phone: "22222222" },
      later,
    );
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, r.booking.id));
    expect((await handlePaymentEvent(db, p.reference, "AUTHORIZED", later))?.status).toBe("confirmed");
  });
});
