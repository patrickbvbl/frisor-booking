import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { customers } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { toCsv } from "@/lib/customers";
import { importCustomers, importPhone, parseCsv, prepareImport } from "@/lib/import";

describe("parseCsv", () => {
  it("finder skilletegnet og håndterer citationstegn og linjeskift i felter", () => {
    expect(parseCsv('a,b\r\n"x, y","sagde ""hej""\nigen"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'sagde "hej"\nigen'],
    ]);
    expect(parseCsv("﻿Navn;Mobil\nLis;12345678")).toEqual([
      ["Navn", "Mobil"],
      ["Lis", "12345678"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("prepareImport", () => {
  it("læser en eksport i Fresha-stil med fornavn, efternavn og mobil", () => {
    const csv = [
      "First Name,Last Name,Mobile Number,Telephone,Email,Note",
      "Anna,Jensen,+45 20 30 40 50,,anna@example.dk,Farve 7.1",
      "Bo,,,33445566,ikke-en-mail,",
      "Carl,Nielsen,,,carl@example.dk,",
    ].join("\n");
    const p = prepareImport(csv);
    expect(p.error).toBeUndefined();
    expect(p.rows).toEqual([
      { line: 2, name: "Anna Jensen", phone: "+4520304050", email: "anna@example.dk", note: "Farve 7.1" },
      { line: 3, name: "Bo", phone: "+4533445566", email: null, note: null },
    ]);
    expect(p.skipped).toEqual([expect.objectContaining({ line: 4, reason: "Mangler telefonnummer" })]);
  });

  it("læser en dansk eksport med semikolon og springer dubletter og forkerte numre over", () => {
    const csv = ["Navn;Telefon;E-mail;Bemærkning", "Lise Holm;4512345678;;Allergi", "Lise H;12 34 56 78;;", "Ole;123;;"].join("\r\n");
    const p = prepareImport(csv);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ name: "Lise Holm", phone: "+4512345678", note: "Allergi" });
    expect(p.skipped.map((s) => s.line)).toEqual([3, 4]);
  });

  it("kan læse vores egen eksport", () => {
    const csv = toCsv([
      ["Navn", "Telefon", "E-mail", "Oprettet", "Besøg", "Udeblevet", "Note"],
      ["Jens; Hansen", "+4522334455", null, "2026-10-01", 3, 0, null],
    ]);
    expect(prepareImport(csv).rows).toEqual([{ line: 2, name: "Jens; Hansen", phone: "+4522334455", email: null, note: null }]);
  });

  it("giver en forståelig fejl uden telefonkolonne", () => {
    expect(prepareImport("Navn,By\nLis,Aarhus").error).toMatch(/telefonnummer/);
  });

  it("normaliserer telefonnumre", () => {
    expect(importPhone("0045 12345678")).toBe("+4512345678");
    expect(importPhone("45 12 34 56 78")).toBe("+4512345678");
    expect(importPhone("+46 70 123 45 67")).toBe("+46701234567");
    expect(importPhone("1234")).toBeNull();
  });
});

describe("importCustomers", () => {
  let db: Db;
  let salonId: number;

  beforeEach(async () => {
    db = await createDb({ dataDir: "memory://" });
    salonId = (await seedDemo(db)).id;
  });

  it("opretter nye kunder og overskriver ikke eksisterende navne", async () => {
    await db.insert(customers).values({ salonId, name: "Anna J.", phone: "+4520304050" });
    const { rows } = prepareImport(
      ["Navn,Mobil,Email,Note", "Anna Jensen,20304050,anna@example.dk,Farve 7.1", "Bo Berg,33445566,,"].join("\n"),
    );
    expect(await importCustomers(db, salonId, rows)).toEqual({ created: 1, updated: 1 });
    const all = await db.select().from(customers);
    expect(all).toHaveLength(2);
    const anna = all.find((c) => c.phone === "+4520304050")!;
    expect(anna).toMatchObject({ name: "Anna J.", email: "anna@example.dk", note: "Farve 7.1" });

    // Samme fil igen giver ingen dubletter.
    expect(await importCustomers(db, salonId, rows)).toEqual({ created: 0, updated: 2 });
    expect(await db.select().from(customers)).toHaveLength(2);
  });
});
