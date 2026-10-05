"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEPOSIT_OVERRIDES, type DepositOverride } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { setVisitNote, updateCustomer } from "@/lib/customers";
import { str } from "@/lib/server";

export async function saveCustomerAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  const name = str(formData.get("name")).trim();
  if (name.length < 2) redirect(`/admin/kunder/${id}?fejl=${encodeURIComponent("Kunden skal have et navn.")}`);
  const override = str(formData.get("depositOverride"));
  await updateCustomer(db, salon.id, id, {
    name,
    email: str(formData.get("email")).trim() || null,
    note: str(formData.get("note")).trim() || null,
    depositOverride: (DEPOSIT_OVERRIDES as readonly string[]).includes(override) ? (override as DepositOverride) : null,
  });
  revalidatePath(`/admin/kunder/${id}`);
  redirect(`/admin/kunder/${id}?gemt=1`);
}

/** Gemmer salonens note om et besøg. Bruges både fra kundekortet og kalenderen. */
export async function saveVisitNoteAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  await setVisitNote(db, salon.id, Number(str(formData.get("bookingId"))), str(formData.get("visitNote")));
  const back = new URL(str(formData.get("back")) || "/admin", "http://x");
  revalidatePath(back.pathname);
  redirect(back.pathname + back.search);
}
