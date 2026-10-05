import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { bookings, customers, smsMessages } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { createBooking, listServices, setOutcome, type Deps } from "@/lib/booking";
import { fromZoned } from "@/lib/time";
import { rebookPlans, rhythmDays, sendRebookReminders } from "@/lib/rebooking";

const TZ = "Europe/Copenhagen";
const DAY = 86400000;

let db: Db;
let salonId: number;
let herreklipId: number;

function deps(now: Date): Deps {
  return {
    now,
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
}

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  salonId = (await seedDemo(db)).id;
  herreklipId = (await listServices(db, salonId)).find((s) => s.name === "Herreklip")!.id;
});

/** Booker og gennemfører en herreklip kl. 10 på en tirsdag (Mette arbejder). */
async function visit(date: string, phone = "20304050", optIn = true) {
  const start = fromZoned(date, 10 * 60, TZ);
  const d = deps(new Date(start.getTime() - 3 * DAY));
  const { booking } = await createBooking(
    db,
    { salonSlug: "demo", serviceId: herreklipId, staffId: null, start, name: "Jens Hansen", phone, rebookOptIn: optIn },
    d,
  );
  await setOutcome(db, booking.id, "completed", d);
  return booking;
}

async function rebookSms() {
  return db.select().from(smsMessages).where(eq(smsMessages.kind, "rebook"));
}

describe("rytme", () => {
  it("bruger medianen af afstanden mellem besøg og ser bort fra besøg samme uge", () => {
    const d = (s: string) => new Date(s);
    expect(rhythmDays([d("2026-01-01"), d("2026-02-12"), d("2026-03-26")])).toBe(42);
    expect(rhythmDays([d("2026-01-01"), d("2026-01-03"), d("2026-02-12")])).toBe(40);
    expect(rhythmDays([d("2026-01-01")])).toBeNull();
    expect(rhythmDays([d("2026-01-01"), d("2026-01-09")])).toBe(14);
  });
});

describe("genbooking", () => {
  it("bruger ydelsens interval, når kunden kun har ét besøg", async () => {
    await visit("2026-09-01");
    const [plan] = await rebookPlans(db, salonId, new Date("2026-09-10T08:00:00Z"));
    expect(plan.source).toBe("ydelse");
    expect(plan.intervalDays).toBe(28);
  });

  it("sender én SMS, når kundens egen rytme siger det er tid", async () => {
    await visit("2026-07-07");
    await visit("2026-08-18"); // 6 uger
    const before = deps(new Date("2026-09-28T08:00:00Z"));
    expect(await sendRebookReminders(db, before)).toBe(0);

    const due = deps(new Date("2026-09-30T08:00:00Z"));
    expect(await sendRebookReminders(db, due)).toBe(1);
    expect(await sendRebookReminders(db, due)).toBe(0);
    const [sms] = await rebookSms();
    expect(sms.to).toBe("+4520304050");
    expect(sms.body).toContain("6 uger siden");
    expect(sms.body).toMatch(/https:\/\/app\.example\/b\/\S+/);
  });

  it("sender ikke uden samtykke", async () => {
    await visit("2026-08-04", "30405060", false);
    expect(await sendRebookReminders(db, deps(new Date("2026-09-03T08:00:00Z")))).toBe(0);
  });

  it("husker et ja, selvom kunden ikke krydser af næste gang", async () => {
    await visit("2026-07-07", "20304050", true);
    await visit("2026-08-04", "20304050", false);
    const [c] = await db.select().from(customers).where(eq(customers.phone, "+4520304050"));
    expect(c.rebookOptIn).toBe(true);
  });

  it("sender ikke, hvis kunden allerede har en tid", async () => {
    await visit("2026-08-04");
    const now = new Date("2026-09-03T08:00:00Z");
    await createBooking(
      db,
      { salonSlug: "demo", serviceId: herreklipId, staffId: null, start: fromZoned("2026-09-08", 10 * 60, TZ), name: "Jens Hansen", phone: "20304050" },
      deps(now),
    );
    expect(await sendRebookReminders(db, deps(now))).toBe(0);
  });

  it("sender ikke til kunder, der er langt over tiden", async () => {
    await visit("2026-03-03");
    expect(await sendRebookReminders(db, deps(new Date("2026-10-05T08:00:00Z")))).toBe(0);
  });

  it("sender igen efter næste besøg", async () => {
    await visit("2026-07-07");
    expect(await sendRebookReminders(db, deps(new Date("2026-08-05T08:00:00Z")))).toBe(1);
    await visit("2026-08-11");
    expect(await sendRebookReminders(db, deps(new Date("2026-09-16T08:00:00Z")))).toBe(1); // rytme 35 dage
    expect(await rebookSms()).toHaveLength(2);
    expect((await db.select().from(bookings)).length).toBe(2);
  });
});
