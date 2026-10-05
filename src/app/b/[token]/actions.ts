"use server";

import { redirect } from "next/navigation";
import { BookingError, cancelBooking, defaultDeps, getBookingDetails } from "@/lib/booking";
import { setRebookOptIn } from "@/lib/rebooking";
import { appDb, str } from "@/lib/server";

export async function cancelAction(formData: FormData) {
  const token = str(formData.get("token"));
  const db = await appDb();
  const d = await getBookingDetails(db, { token });
  if (!d) redirect("/");
  let msg = "aflyst";
  try {
    await cancelBooking(db, d.booking.id, "customer", defaultDeps());
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    msg = e.message;
  }
  redirect(`/b/${token}?besked=${encodeURIComponent(msg)}`);
}

export async function rebookOptOutAction(formData: FormData) {
  const token = str(formData.get("token"));
  const db = await appDb();
  const d = await getBookingDetails(db, { token });
  if (!d) redirect("/");
  await setRebookOptIn(db, d.customer.id, false);
  redirect(`/b/${token}?besked=stop`);
}
