"use server";

import { redirect } from "next/navigation";
import { BookingError, defaultDeps } from "@/lib/booking";
import { appDb, str } from "@/lib/server";
import { bookFromWaitlist, leaveWaitlist } from "@/lib/waitlist";

export async function bookFromWaitlistAction(formData: FormData) {
  const token = str(formData.get("token"));
  let target: string;
  try {
    const db = await appDb();
    const { booking, redirectUrl } = await bookFromWaitlist(db, token, new Date(str(formData.get("start"))), defaultDeps());
    target = redirectUrl ?? `/b/${booking.token}?ny=1`;
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    target = `/venteliste/${token}?besked=${encodeURIComponent(e.message)}`;
  }
  redirect(target);
}

export async function leaveWaitlistAction(formData: FormData) {
  const token = str(formData.get("token"));
  const db = await appDb();
  await leaveWaitlist(db, { token });
  redirect(`/venteliste/${token}?besked=afmeldt`);
}
