import { describe, expect, it } from "vitest";
import { addDays, fromZoned, hhmmToMinutes, toZoned, weekdayOf } from "@/lib/time";
import { normalizePhone } from "@/lib/format";

const TZ = "Europe/Copenhagen";

describe("tidszoner", () => {
  it("regner sommertid og vintertid rigtigt", () => {
    expect(fromZoned("2026-07-01", 10 * 60, TZ).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(fromZoned("2026-12-01", 10 * 60, TZ).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("håndterer dagen hvor uret stilles tilbage", () => {
    // 25. oktober 2026 går Danmark fra sommertid til vintertid kl. 03:00.
    expect(fromZoned("2026-10-25", 9 * 60, TZ).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(fromZoned("2026-10-24", 9 * 60, TZ).toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("går frem og tilbage", () => {
    const t = fromZoned("2026-03-30", 13 * 60 + 15, TZ);
    expect(toZoned(t, TZ)).toEqual({ date: "2026-03-30", minutes: 13 * 60 + 15, weekday: 1 });
  });

  it("ugedage og datoer", () => {
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(weekdayOf("2026-10-11")).toBe(7);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(hhmmToMinutes("9:30")).toBe(570);
    expect(hhmmToMinutes("25:00")).toBeNull();
  });
});

describe("telefonnumre", () => {
  it("normaliserer danske numre", () => {
    expect(normalizePhone("12 34 56 78")).toBe("+4512345678");
    expect(normalizePhone("+45 12345678")).toBe("+4512345678");
    expect(normalizePhone("004512345678")).toBe("+4512345678");
    expect(normalizePhone("1234")).toBeNull();
  });
});
