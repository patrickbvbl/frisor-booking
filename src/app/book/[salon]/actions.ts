"use server";

import { redirect } from "next/navigation";
import { BookingError, createBooking, defaultDeps } from "@/lib/booking";
import { appDb, str } from "@/lib/server";

export async function bookAction(formData: FormData) {
  const salonSlug = str(formData.get("salon"));
  const back = str(formData.get("back"));
  let target: string;
  try {
    const db = await appDb();
    const staffRaw = str(formData.get("staffId"));
    const { booking, redirectUrl } = await createBooking(
      db,
      {
        salonSlug,
        serviceId: Number(str(formData.get("serviceId"))),
        staffId: staffRaw === "any" ? null : Number(staffRaw),
        start: new Date(str(formData.get("start"))),
        name: str(formData.get("name")),
        phone: str(formData.get("phone")),
        email: str(formData.get("email")),
        note: str(formData.get("note")),
      },
      defaultDeps(),
    );
    target = redirectUrl ?? `/b/${booking.token}?ny=1`;
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    const url = new URL(back || `/book/${salonSlug}`, "http://x");
    url.searchParams.set("fejl", e.message);
    target = url.pathname + url.search;
  }
  redirect(target);
}
