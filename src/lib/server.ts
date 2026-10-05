import { connection } from "next/server";
import { getDb } from "@/db/client";

/** Databasen til sider og actions. connection() sørger for at Next ikke prøver at læse den under build. */
export async function appDb() {
  await connection();
  return getDb();
}

export function str(v: FormDataEntryValue | string | string[] | null | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}
