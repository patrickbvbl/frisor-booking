import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { smsMessages, waitlistEntries, type Staff } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { BookingError, cancelBooking, createBooking, listServices, type Deps } from "@/lib/booking";
import { fromZoned } from "@/lib/time";
import { bookFromWaitlist, joinWaitlist, listWaitlist, offerFreedTime } from "@/lib/waitlist";

const TZ = "Europe/Copenhagen";
const DAY = "2026-10-06"; // tirsdag, Mette arbejder 9 til 17

let db: Db;
let deps: Deps;
let mette: Staff;
let herreklipId: number;
let salonId: number;

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  const salon = await seedDemo(db);
  salonId = salon.id;
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
  herreklipId = (await listServices(db, salon.id)).find((s) => s.name === "Herreklip")!.id;
});

/** Booker Mettes formiddag helt op, så der ikke er en ledig herreklip før kl. 12. */
async function fillMorning() {
  const ids: number[] = [];
  for (let i = 0; i < 7; i++) {
    const { booking } = await createBooking(
      db,
      {
        salonSlug: "demo",
        serviceId: herreklipId,
        staffId: mette.id,
        start: fromZoned(DAY, 9 * 60 + i * 30, TZ),
        name: `Kunde ${i}`,
        phone: `1000000${i}`,
      },
      deps,
    );
    ids.push(booking.id);
  }
  return ids;
}

function join(name: string, phone: string) {
  return joinWaitlist(
    db,
    { salonSlug: "demo", serviceId: herreklipId, staffId: mette.id, date: DAY, period: "morning", name, phone },
    deps,
  );
}

async function smsOf(kind: string) {
  return db.select().from(smsMessages).where(eq(smsMessages.kind, kind));
}

describe("venteliste", () => {
  it("skriver kunden på og sender en SMS med link", async () => {
    const entry = await join("Lone Berg", "20304050");
    expect(entry.status).toBe("waiting");
    const sms = await smsOf("waitlist");
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain(`/venteliste/${entry.token}`);
    expect(sms[0].body).toContain("tirsdag d. 6. oktober");
  });

  it("opdaterer pladsen i stedet for at oprette en ny, hvis kunden skriver sig på igen", async () => {
    const a = await join("Lone Berg", "20304050");
    const b = await joinWaitlist(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: null, date: DAY, period: "all", name: "Lone Berg", phone: "20304050" },
      deps,
    );
    expect(b.id).toBe(a.id);
    expect(b.staffId).toBeNull();
    expect(await listWaitlist(db, salonId, DAY)).toHaveLength(1);
  });

  it("afviser en dag der er gået", async () => {
    await expect(
      joinWaitlist(
        db,
        { salonSlug: "demo", serviceId: herreklipId, staffId: null, date: "2026-09-30", period: "all", name: "Lone", phone: "20304050" },
        deps,
      ),
    ).rejects.toBeInstanceOf(BookingError);
  });

  it("tilbyder en aflyst tid til de første i køen, og den første der booker får den", async () => {
    const ids = await fillMorning();
    const first = await join("Lone Berg", "20304050");
    const second = await join("Per Holm", "30405060");

    await cancelBooking(db, ids[0], "customer", deps);
    const offers = await smsOf("waitlist_offer");
    expect(offers.map((s) => s.to).sort()).toEqual(["+4520304050", "+4530405060"]);
    expect(offers.find((s) => s.to === "+4520304050")!.body).toContain("kl. 09:00");

    // Den anden i køen trykker først og får tiden.
    const start = fromZoned(DAY, 9 * 60, TZ);
    const { booking } = await bookFromWaitlist(db, second.token, start, deps);
    expect(booking.status).toBe("confirmed");
    expect(booking.staffId).toBe(mette.id);

    await expect(bookFromWaitlist(db, first.token, start, deps)).rejects.toThrow(/stadig på ventelisten/);
    const rows = await db.select().from(waitlistEntries);
    expect(rows.find((r) => r.id === second.id)!.status).toBe("booked");
    expect(rows.find((r) => r.id === second.id)!.bookingId).toBe(booking.id);
    expect(rows.find((r) => r.id === first.id)!.status).toBe("waiting");
  });

  it("sender ikke tilbud, når den ledige tid ligger uden for kundens tidsrum", async () => {
    await fillMorning();
    // En tid kl. 14 bliver ledig, men kunden vil kun have formiddag.
    const { booking } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: mette.id, start: fromZoned(DAY, 14 * 60, TZ), name: "X Y", phone: "40506070" },
      deps,
    );
    await join("Lone Berg", "20304050");
    await cancelBooking(db, booking.id, "salon", deps);
    expect(await smsOf("waitlist_offer")).toHaveLength(0);
  });

  it("sender ikke tilbud om tider, der allerede var ledige, når en anden frisør får et afbud", async () => {
    // Kunden vil have Mette hele dagen, og hun har ledige tider om eftermiddagen i forvejen.
    await joinWaitlist(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: mette.id, date: DAY, period: "all", name: "Lone", phone: "20304050" },
      deps,
    );
    const ali = (await db.query.staff.findFirst({ where: (s, { eq }) => eq(s.name, "Ali") }))!;
    const { booking } = await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: ali.id, start: fromZoned(DAY, 11 * 60, TZ), name: "X Y", phone: "40506070" },
      deps,
    );
    await cancelBooking(db, booking.id, "customer", deps);
    expect(await smsOf("waitlist_offer")).toHaveLength(0);
    // Salonen kan selv sende de ledige tider ud.
    expect(await offerFreedTime(db, salonId, DAY, deps)).toBe(1);
  });

  it("sender højst til de tre første i køen", async () => {
    const ids = await fillMorning();
    for (let i = 0; i < 5; i++) await join(`Kunde K${i}`, `5000000${i}`);
    await cancelBooking(db, ids[2], "salon", deps);
    expect(await smsOf("waitlist_offer")).toHaveLength(3);
    expect(await offerFreedTime(db, salonId, DAY, deps)).toBe(3);
  });

  it("lukker pladsen, hvis kunden selv booker en tid samme dag", async () => {
    const entry = await join("Lone Berg", "20304050");
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: null, start: fromZoned(DAY, 15 * 60, TZ), name: "Lone Berg", phone: "20304050" },
      deps,
    );
    const [row] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, entry.id));
    expect(row.status).toBe("booked");
  });
});
