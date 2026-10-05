import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { customers, smsMessages, type Salon } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { BookingError, createStaffBooking, getWeekCalendar, listServices, listStaff, type Deps } from "@/lib/booking";
import { findCustomers, listCustomers } from "@/lib/customers";
import { fromZoned } from "@/lib/time";

const TZ = "Europe/Copenhagen";
// Tirsdag 6. oktober 2026.
const DAY = "2026-10-06";

let db: Db;
let salon: Salon;
let deps: Deps;

async function service(name: string) {
  return (await listServices(db, salon.id)).find((s) => s.name === name)!;
}

async function member(name: string) {
  return (await listStaff(db, salon.id)).find((s) => s.name === name)!;
}

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
        throw new Error("Salonens egne bookinger må ikke starte en betaling");
      },
      async capture() {},
      async cancel() {},
      async refund() {},
    },
  };
});

describe("salonen opretter selv en booking", () => {
  it("opretter ny kunde og bekræfter uden depositum, også på en ydelse med depositum", async () => {
    const farve = await service("Farve og klip");
    const mette = await member("Mette");
    const booking = await createStaffBooking(
      db,
      salon,
      { serviceId: farve.id, staffId: mette.id, start: fromZoned(DAY, 10 * 60, TZ), name: "Rikke Holm", phone: "55 66 77 88", sendSms: true },
      deps,
    );
    expect(booking.status).toBe("confirmed");
    expect(booking.depositOre).toBe(0);
    expect(booking.processingStartsAt).not.toBeNull();
    const [c] = await db.select().from(customers);
    expect(c.phone).toBe("+4555667788");
    expect(await db.select().from(smsMessages)).toHaveLength(1);
  });

  it("bruger en eksisterende kunde og sender ingen SMS, når salonen fravælger det", async () => {
    const herreklip = await service("Herreklip");
    const mette = await member("Mette");
    const first = await createStaffBooking(
      db,
      salon,
      { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 9 * 60, TZ), name: "Jens", phone: "22334455", sendSms: false },
      deps,
    );
    // Samme nummer igen giver ikke en ny kunde.
    const again = await createStaffBooking(
      db,
      salon,
      { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 11 * 60, TZ), name: "Jens H", phone: "22334455", sendSms: false },
      deps,
    );
    expect(again.customerId).toBe(first.customerId);
    const byId = await createStaffBooking(
      db,
      salon,
      { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 12 * 60, TZ), customerId: first.customerId, sendSms: false },
      deps,
    );
    expect(byId.customerId).toBe(first.customerId);
    expect(await db.select().from(customers)).toHaveLength(1);
    expect(await db.select().from(smsMessages)).toHaveLength(0);
  });

  it("afviser en tid oven i en anden kunde, men tillader en kunde i virketiden", async () => {
    const farve = await service("Farve og klip");
    const herreklip = await service("Herreklip");
    const mette = await member("Mette");
    await createStaffBooking(
      db,
      salon,
      { serviceId: farve.id, staffId: mette.id, start: fromZoned(DAY, 10 * 60, TZ), name: "Farve", phone: "11111111", sendSms: false },
      deps,
    );
    await expect(
      createStaffBooking(
        db,
        salon,
        { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 10 * 60 + 15, TZ), name: "Ole", phone: "22222222", sendSms: false },
        deps,
      ),
    ).rejects.toThrow(/Mette har allerede en kunde/);
    // 10:30 til 11:15 er virketid, så en herreklip kl. 10:30 passer.
    const inGap = await createStaffBooking(
      db,
      salon,
      { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 10 * 60 + 30, TZ), name: "Ole", phone: "22222222", sendSms: false },
      deps,
    );
    expect(inGap.status).toBe("confirmed");
  });

  it("må booke uden for arbejdstid, fx en sen kunde", async () => {
    const herreklip = await service("Herreklip");
    const mette = await member("Mette");
    const late = await createStaffBooking(
      db,
      salon,
      { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 17 * 60 + 30, TZ), name: "Sen kunde", phone: "33333333", sendSms: false },
      deps,
    );
    expect(late.status).toBe("confirmed");
  });

  it("kræver navn og gyldigt nummer for en ny kunde", async () => {
    const herreklip = await service("Herreklip");
    const mette = await member("Mette");
    const input = { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(DAY, 9 * 60, TZ), sendSms: false };
    await expect(createStaffBooking(db, salon, { ...input, name: "", phone: "22334455" }, deps)).rejects.toBeInstanceOf(BookingError);
    await expect(createStaffBooking(db, salon, { ...input, name: "Jens", phone: "123" }, deps)).rejects.toBeInstanceOf(BookingError);
  });

  it("viser bookinger fra hele ugen i ugevisningen", async () => {
    const herreklip = await service("Herreklip");
    const mette = await member("Mette");
    for (const [day, phone] of [["2026-10-05", "11111111"], ["2026-10-11", "22222222"], ["2026-10-12", "33333333"]]) {
      await createStaffBooking(
        db,
        salon,
        { serviceId: herreklip.id, staffId: mette.id, start: fromZoned(day, 10 * 60, TZ), name: "Kunde", phone, sendSms: false },
        deps,
      );
    }
    const week = await getWeekCalendar(db, salon, "2026-10-05");
    expect(week.bookings).toHaveLength(2); // mandag 12. hører til næste uge
    expect(new Set(week.hours.map((h) => h.weekday)).size).toBe(6); // ingen arbejder søndag
  });
});

describe("kundesøgning", () => {
  beforeEach(async () => {
    await db.insert(customers).values([
      { salonId: salon.id, name: "Anne Jensen", phone: "+4522334455", email: "anne@example.dk" },
      { salonId: salon.id, name: "Bo Hansen", phone: "+4566778899" },
      { salonId: salon.id, name: "Anna 100%_Larsen", phone: "+4512121212" },
    ]);
  });

  const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

  it("finder på navn, flere ord og uden skelnen mellem store og små bogstaver", async () => {
    expect(names(await listCustomers(db, salon.id, "anne"))).toEqual(["Anne Jensen"]);
    expect(names(await listCustomers(db, salon.id, "ANN"))).toEqual(["Anna 100%_Larsen", "Anne Jensen"]);
    expect(names(await listCustomers(db, salon.id, "jen anne"))).toEqual(["Anne Jensen"]);
  });

  it("finder på telefon skrevet med mellemrum og på e-mail", async () => {
    expect(names(await findCustomers(db, salon.id, "66 77 88"))).toEqual(["Bo Hansen"]);
    expect(names(await findCustomers(db, salon.id, "anne@ex"))).toEqual(["Anne Jensen"]);
  });

  it("behandler % og _ som almindelige tegn og viser alle uden søgning", async () => {
    expect(names(await listCustomers(db, salon.id, "%"))).toEqual(["Anna 100%_Larsen"]);
    expect(names(await listCustomers(db, salon.id, "_"))).toEqual(["Anna 100%_Larsen"]);
    expect(await listCustomers(db, salon.id, "")).toHaveLength(3);
    expect(await findCustomers(db, salon.id, "  ")).toHaveLength(0);
  });
});
