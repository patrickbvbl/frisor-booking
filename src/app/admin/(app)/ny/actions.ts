"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { BookingError, createStaffBooking, defaultDeps } from "@/lib/booking";
import { str } from "@/lib/server";
import { fromZoned, hhmmToMinutes, isIsoDate } from "@/lib/time";

/** Kun adresser i admin, så formularen ikke kan sende videre til en fremmed side. */
function safeReturn(v: string): string {
  return v.startsWith("/admin") && !v.startsWith("//") ? v : "/admin";
}

export async function createStaffBookingAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const get = (k: string) => str(formData.get(k)).trim();
  const date = get("dato");
  const minutes = hhmmToMinutes(get("tid"));
  const retur = safeReturn(get("retur"));

  let bookingId: number | undefined;
  try {
    if (!isIsoDate(date) || minutes === null) throw new BookingError("Vælg dato og tidspunkt.");
    const booking = await createStaffBooking(
      db,
      salon,
      {
        serviceId: Number(get("ydelse")),
        staffId: Number(get("medarbejder")),
        start: fromZoned(date, minutes, salon.timezone),
        customerId: Number(get("kunde")) || null,
        name: get("navn"),
        phone: get("telefon"),
        email: get("email"),
        note: get("note"),
        sendSms: formData.get("sms") === "on",
      },
      defaultDeps(),
    );
    bookingId = booking.id;
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    // Tilbage til formularen med det, der var skrevet, så intet skal tastes igen.
    const params = new URLSearchParams();
    for (const k of ["dato", "tid", "medarbejder", "ydelse", "kunde", "navn", "telefon", "email", "note", "retur"]) {
      if (get(k)) params.set(k, get(k));
    }
    if (formData.get("sms") !== "on") params.set("sms", "nej");
    params.set("fejl", e.message);
    redirect(`/admin/ny?${params}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/kunder");
  // Vis bookingen i kalenderen på den dag, den ligger, i den visning frisøren kom fra.
  const url = new URL(retur, "http://x");
  url.searchParams.set("dato", date);
  if (url.searchParams.has("medarbejder")) url.searchParams.set("medarbejder", get("medarbejder"));
  url.searchParams.set("valgt", String(bookingId));
  redirect(url.pathname + url.search);
}

