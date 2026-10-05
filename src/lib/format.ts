import { toZoned, minutesToHhmm } from "./time";

export function kr(ore: number): string {
  const v = ore / 100;
  return `${v.toLocaleString("da-DK", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} kr.`;
}

export function clock(instant: Date, tz: string): string {
  return minutesToHhmm(toZoned(instant, tz).minutes);
}

/** "tirsdag d. 7. oktober" */
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("da-DK", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.replace(/^(\p{L}+)\s/u, "$1 d. ");
}

export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("da-DK", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Normaliserer danske numre til +45XXXXXXXX. Returnerer null hvis nummeret ikke ligner et gyldigt nummer. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\d{8}$/.test(digits)) return `+45${digits}`;
  if (/^0045\d{8}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^\+45\d{8}$/.test(digits)) return digits;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

/** "+4512345678" vises som "+45 12 34 56 78". */
export function displayPhone(phone: string): string {
  const m = /^\+45(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+45 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
