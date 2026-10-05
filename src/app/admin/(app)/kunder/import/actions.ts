"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { countExisting, FIELD_LABELS, importCustomers, prepareImport, type SkippedRow } from "@/lib/import";
import { str } from "@/lib/server";

export type ImportState =
  | { step: "upload"; error?: string }
  | {
      step: "preview";
      csv: string;
      fileName: string;
      columns: { field: string; header: string }[];
      total: number;
      newCount: number;
      existingCount: number;
      sample: { name: string; phone: string; email: string | null; note: string | null }[];
      skipped: SkippedRow[];
    }
  | { step: "done"; created: number; updated: number; skipped: number };

const MAX_BYTES = 4 * 1024 * 1024;

async function readCsv(formData: FormData): Promise<{ csv: string; fileName: string } | { error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "Filen er for stor. Del den op i flere filer på under 4 MB." };
    const buf = Buffer.from(await file.arrayBuffer());
    // Excel gemmer nogle gange CSV som Windows-1252 i stedet for UTF-8. Så bliver æøå til erstatningstegn.
    let csv = buf.toString("utf8");
    if (csv.includes("�")) csv = new TextDecoder("windows-1252").decode(buf);
    return { csv, fileName: file.name };
  }
  const csv = str(formData.get("csv"));
  if (csv) return { csv, fileName: str(formData.get("fileName")) };
  return { error: "Vælg en CSV-fil." };
}

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { db, salon } = await requireAdmin();
  const input = await readCsv(formData);
  if ("error" in input) return { step: "upload", error: input.error };
  if (/^PK/.test(input.csv)) {
    return { step: "upload", error: "Det ligner en Excel-fil (.xlsx). Åbn den i Excel og gem den som CSV først." };
  }
  const preview = prepareImport(input.csv);
  if (preview.error) return { step: "upload", error: preview.error };

  if (str(formData.get("confirm")) === "1") {
    const { created, updated } = await importCustomers(db, salon.id, preview.rows);
    revalidatePath("/admin/kunder");
    return { step: "done", created, updated, skipped: preview.skipped.length };
  }

  const existingCount = await countExisting(db, salon.id, preview.rows);
  return {
    step: "preview",
    csv: input.csv,
    fileName: input.fileName,
    columns: Object.entries(preview.columns).map(([field, i]) => ({
      field: FIELD_LABELS[field as keyof typeof FIELD_LABELS],
      header: preview.headers[i!],
    })),
    total: preview.rows.length,
    newCount: preview.rows.length - existingCount,
    existingCount,
    sample: preview.rows.slice(0, 5).map(({ name, phone, email, note }) => ({ name, phone, email, note })),
    skipped: preview.skipped.slice(0, 50),
  };
}
