import { describe, expect, it } from "vitest";
import { computeSlots } from "@/lib/availability";
import { fromZoned } from "@/lib/time";

const TZ = "Europe/Copenhagen";
const at = (hhmm: string, date = "2026-10-06") => {
  const [h, m] = hhmm.split(":").map(Number);
  return fromZoned(date, h * 60 + m, TZ);
};
const hhmm = (d: Date) => d.toLocaleTimeString("da-DK", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

describe("computeSlots", () => {
  const base = {
    date: "2026-10-06",
    tz: TZ,
    windows: [{ startMin: 9 * 60, endMin: 12 * 60 }],
    busy: [],
    now: new Date("2026-10-01T00:00:00Z"),
  };

  it("giver tider hvert kvarter, så ydelsen kan nå at blive færdig", () => {
    const slots = computeSlots({ ...base, durationMin: 60 });
    expect(slots.map(hhmm)).toEqual(["09.00", "09.15", "09.30", "09.45", "10.00", "10.15", "10.30", "10.45", "11.00"]);
  });

  it("springer tider over der overlapper en booking", () => {
    const slots = computeSlots({ ...base, durationMin: 30, busy: [{ start: at("10:00"), end: at("10:45") }] });
    expect(slots.map(hhmm)).toEqual(["09.00", "09.15", "09.30", "10.45", "11.00", "11.15", "11.30"]);
  });

  it("tilbyder ikke tider der er for tæt på nu", () => {
    const slots = computeSlots({ ...base, durationMin: 30, now: at("09:20") });
    expect(slots.map(hhmm)[0]).toBe("10.30");
  });

  it("understøtter flere vinduer, fx med frokostpause", () => {
    const slots = computeSlots({
      ...base,
      durationMin: 60,
      windows: [
        { startMin: 9 * 60, endMin: 10 * 60 },
        { startMin: 11 * 60, endMin: 12 * 60 },
      ],
    });
    expect(slots.map(hhmm)).toEqual(["09.00", "11.00"]);
  });

  it("giver ingen tider uden arbejdstid", () => {
    expect(computeSlots({ ...base, windows: [], durationMin: 30 })).toEqual([]);
  });
});
