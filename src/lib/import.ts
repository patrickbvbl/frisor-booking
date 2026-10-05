import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { customers } from "@/db/schema";
import { normalizePhone } from "./format";

/**
 * Import af kundekartotek fra Planway, Fresha eller et regneark.
 * Vi kender ikke alle systemers præcise kolonnenavne, så kolonnerne genkendes ud fra en liste af navne på dansk og engelsk.
 */

/** Læser CSV med komma, semikolon eller tabulator. Håndterer citationstegn, linjeskift i felter og BOM fra Excel. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

type Field = "name" | "firstName" | "lastName" | "mobile" | "phone" | "email" | "note";

const ALIASES: Record<Field, string[]> = {
  name: ["navn", "name", "fuldenavn", "fulltnavn", "fullname", "kundenavn", "kunde", "client", "clientname", "customer", "customername"],
  firstName: ["fornavn", "firstname", "first", "givenname"],
  lastName: ["efternavn", "lastname", "last", "surname", "familyname"],
  mobile: ["mobil", "mobilnummer", "mobilnr", "mobiltelefon", "mobile", "mobilenumber", "mobilephone", "cell", "cellphone"],
  phone: ["telefon", "telefonnummer", "telefonnr", "tlf", "tlfnr", "phone", "phonenumber", "telephone", "tel"],
  email: ["email", "mail", "emailadresse", "emailaddress", "mailadresse"],
  note: ["note", "noter", "notes", "notat", "notater", "bemærkning", "bemærkninger", "kommentar", "kommentarer", "comment", "comments", "clientnote", "clientnotes", "kundenote"],
};

export const FIELD_LABELS: Record<Field, string> = {
  name: "Navn",
  firstName: "Fornavn",
  lastName: "Efternavn",
  mobile: "Mobil",
  phone: "Telefon",
  email: "E-mail",
  note: "Note",
};

function key(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
}

/** Finder hvilken kolonne der er hvad. Returnerer kolonnenummer pr. felt. */
export function detectColumns(headers: string[]): Partial<Record<Field, number>> {
  const keys = headers.map(key);
  const found: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const i = keys.findIndex((k) => ALIASES[field].includes(k));
    if (i >= 0) found[field] = i;
  }
  // Kolonner som "Mobile Number (+45)" eller "Telefon privat".
  if (found.mobile === undefined) {
    const i = keys.findIndex((k) => k.startsWith("mobil"));
    if (i >= 0) found.mobile = i;
  }
  if (found.phone === undefined) {
    const i = keys.findIndex((k, idx) => idx !== found.mobile && (k.startsWith("telefon") || k.startsWith("phone") || k.startsWith("tlf")));
    if (i >= 0) found.phone = i;
  }
  return found;
}

/** Som normalizePhone, men tager også numre der er gemt som 4512345678 eller 004512345678 uden plus. */
export function importPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^45\d{8}$/.test(digits)) return `+${digits}`;
  return normalizePhone(digits);
}

export type ImportRow = { line: number; name: string; phone: string; email: string | null; note: string | null };
export type SkippedRow = { line: number; reason: string; raw: string };

export type ImportPreview = {
  headers: string[];
  columns: Partial<Record<Field, number>>;
  rows: ImportRow[];
  skipped: SkippedRow[];
  /** Sat hvis filen slet ikke kan bruges. */
  error?: string;
};

export function prepareImport(text: string): ImportPreview {
  const all = parseCsv(text);
  if (all.length < 2) return { headers: all[0] ?? [], columns: {}, rows: [], skipped: [], error: "Filen er tom eller har kun en overskrift." };
  const [headers, ...data] = all;
  const columns = detectColumns(headers);
  if (columns.mobile === undefined && columns.phone === undefined) {
    return { headers, columns, rows: [], skipped: [], error: "Fandt ingen kolonne med telefonnummer. Den skal hedde fx Mobil, Telefon eller Mobile Number." };
  }
  if (columns.name === undefined && columns.firstName === undefined) {
    return { headers, columns, rows: [], skipped: [], error: "Fandt ingen kolonne med navn. Den skal hedde fx Navn, Fornavn eller First Name." };
  }

  const get = (r: string[], f: Field) => (columns[f] === undefined ? "" : (r[columns[f]!] ?? "").trim());
  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();
  data.forEach((r, i) => {
    const line = i + 2;
    const raw = r.join(", ").slice(0, 120);
    const name = get(r, "name") || [get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ");
    const phoneRaw = get(r, "mobile") || get(r, "phone");
    if (!phoneRaw) return skipped.push({ line, reason: "Mangler telefonnummer", raw });
    const phone = importPhone(phoneRaw);
    if (!phone) return skipped.push({ line, reason: `Telefonnummeret "${phoneRaw}" ser forkert ud`, raw });
    if (!name) return skipped.push({ line, reason: "Mangler navn", raw });
    if (seen.has(phone)) return skipped.push({ line, reason: "Samme telefonnummer står længere oppe i filen", raw });
    seen.add(phone);
    const email = get(r, "email");
    rows.push({ line, name, phone, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null, note: get(r, "note") || null });
  });
  return { headers, columns, rows, skipped };
}

/** Hvor mange af rækkerne der er nye kunder, og hvor mange der findes i forvejen (samme telefonnummer). */
export async function countExisting(db: Db, salonId: number, rows: ImportRow[]): Promise<number> {
  let existing = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const phones = rows.slice(i, i + 500).map((r) => r.phone);
    const found = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.salonId, salonId), inArray(customers.phone, phones)));
    existing += found.length;
  }
  return existing;
}

/**
 * Gemmer kunderne. Findes en kunde allerede (samme telefonnummer), beholdes navnet,
 * og e-mail og note udfyldes kun hvis de mangler. Så kan importen køres flere gange uden at overskrive noget.
 */
export async function importCustomers(db: Db, salonId: number, rows: ImportRow[]): Promise<{ created: number; updated: number }> {
  const existing = await countExisting(db, salonId, rows);
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(customers)
        .values(rows.slice(i, i + 500).map((r) => ({ salonId, name: r.name, phone: r.phone, email: r.email, note: r.note })))
        .onConflictDoUpdate({
          target: [customers.salonId, customers.phone],
          set: {
            email: sql`coalesce(${customers.email}, excluded.email)`,
            note: sql`coalesce(${customers.note}, excluded.note)`,
          },
        });
    }
  });
  return { created: rows.length - existing, updated: existing };
}
