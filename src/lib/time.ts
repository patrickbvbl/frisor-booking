// Små tidszonehjælpere uden afhængigheder. Al lagring sker i UTC, al visning i salonens tidszone.

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type ZonedParts = {
  /** YYYY-MM-DD */
  date: string;
  /** Minutter efter midnat */
  minutes: number;
  /** 1 = mandag ... 7 = søndag */
  weekday: number;
};

export function toZoned(instant: Date, tz: string): ZonedParts {
  const p = Object.fromEntries(formatterFor(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: WEEKDAYS[p.weekday],
  };
}

/** Forskel mellem lokal tid og UTC i minutter på et givent tidspunkt (fx 120 om sommeren i Danmark). */
function offsetMinutes(instant: Date, tz: string): number {
  const p = Object.fromEntries(formatterFor(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Lokal dato og klokkeslæt i en tidszone til et UTC-tidspunkt. */
export function fromZoned(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetMinutes(new Date(guess), tz) * 60000;
  const second = guess - offsetMinutes(new Date(first), tz) * 60000;
  return new Date(second);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = søndag
  return js === 0 ? 7 : js;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function minutesToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || h * 60 + mi > 24 * 60) return null;
  return h * 60 + mi;
}
