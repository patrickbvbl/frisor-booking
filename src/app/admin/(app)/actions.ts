"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bookings, salons, serviceCategories, services, staff, workingHours } from "@/db/schema";
import { endSession, requireAdmin } from "@/lib/auth";
import { BookingError, cancelBooking, defaultDeps, setOutcome } from "@/lib/booking";
import { nextServicePosition } from "@/lib/categories";
import { str } from "@/lib/server";
import { hhmmToMinutes, isIsoDate } from "@/lib/time";
import { leaveWaitlist, offerFreedTime } from "@/lib/waitlist";

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}

function back(formData: FormData, msg?: string) {
  const url = new URL(str(formData.get("back")) || "/admin", "http://x");
  if (msg) url.searchParams.set("fejl", msg);
  return url.pathname + url.search;
}

export async function bookingAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("bookingId")));
  const op = str(formData.get("op"));
  const booking = await db.query.bookings.findFirst({ where: and(eq(bookings.id, id), eq(bookings.salonId, salon.id)) });
  if (!booking) redirect(back(formData, "Bookingen findes ikke."));
  try {
    if (op === "cancel") await cancelBooking(db, id, "salon", defaultDeps());
    else if (op === "completed" || op === "no_show") await setOutcome(db, id, op, defaultDeps());
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    redirect(back(formData, e.message));
  }
  revalidatePath("/admin");
  redirect(back(formData));
}

function kroner(v: FormDataEntryValue | null): number {
  const n = Number(str(v).replace(",", ".") || "0");
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Viser siden igen med friske data og en "Gemt" besked ved det, der blev gemt. */
function savedSettings(anchor: string): never {
  revalidatePath("/admin/indstillinger");
  redirect(`/admin/indstillinger?gemt=${anchor}#${anchor}`);
}

function minutes(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(str(v)) / 5) * 5;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function saveServiceAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  const values = {
    name: str(formData.get("name")).trim(),
    durationMin: Math.max(5, Math.round(Number(str(formData.get("durationMin"))) / 5) * 5 || 30),
    priceOre: kroner(formData.get("price")),
    depositOre: kroner(formData.get("deposit")),
    processingAfterMin: minutes(formData.get("processingAfterMin")),
    processingMin: minutes(formData.get("processingMin")),
    rebookWeeks: Math.round(Number(str(formData.get("rebookWeeks")))) || null,
    description: str(formData.get("description")).trim().slice(0, 300) || null,
    categoryId: Number(str(formData.get("categoryId"))) || null,
    active: formData.get("active") === "on",
  };
  if (values.categoryId) {
    const category = await db.query.serviceCategories.findFirst({
      where: and(eq(serviceCategories.id, values.categoryId), eq(serviceCategories.salonId, salon.id)),
    });
    if (!category) values.categoryId = null;
  }
  if (!values.name) redirect("/admin/indstillinger?fejl=Ydelsen skal have et navn.");
  if (values.processingMin > 0 && (values.processingAfterMin <= 0 || values.processingAfterMin + values.processingMin >= values.durationMin)) {
    redirect(
      `/admin/indstillinger?fejl=${encodeURIComponent(`Virketiden for ${values.name} skal starte efter mindst 5 minutter og slutte før ydelsen er færdig.`)}`,
    );
  }
  if (values.processingMin <= 0) values.processingAfterMin = 0;
  if (id) {
    const before = await db.query.services.findFirst({ where: and(eq(services.id, id), eq(services.salonId, salon.id)) });
    // Skifter ydelsen kategori, lægges den nederst i den nye.
    const position = before && before.categoryId !== values.categoryId ? await nextServicePosition(db, salon.id, values.categoryId) : undefined;
    await db.update(services).set({ ...values, position }).where(and(eq(services.id, id), eq(services.salonId, salon.id)));
  } else {
    const position = await nextServicePosition(db, salon.id, values.categoryId);
    const [created] = await db.insert(services).values({ ...values, position, active: true, salonId: salon.id }).returning();
    savedSettings(`ydelse-${created.id}`);
  }
  savedSettings(`ydelse-${id}`);
}

/** Salonens regler for afbud og depositum. */
export async function savePolicyAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const hours = Math.round(Number(str(formData.get("cancellationHours"))));
  const noShows = Math.round(Number(str(formData.get("depositAfterNoShows"))));
  await db
    .update(salons)
    .set({
      cancellationHours: Number.isFinite(hours) && hours >= 0 && hours <= 168 ? hours : salon.cancellationHours,
      depositMode: str(formData.get("depositMode")) === "no_show" ? "no_show" : "always",
      depositAfterNoShows: Number.isFinite(noShows) && noShows >= 1 && noShows <= 10 ? noShows : salon.depositAfterNoShows,
    })
    .where(eq(salons.id, salon.id));
  savedSettings("regler");
}

export async function saveStaffAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  const name = str(formData.get("name")).trim();
  if (!name) redirect("/admin/indstillinger?fejl=Medarbejderen skal have et navn.");

  const hours: { weekday: number; startMin: number; endMin: number }[] = [];
  for (let d = 1; d <= 7; d++) {
    const from = str(formData.get(`from${d}`));
    const to = str(formData.get(`to${d}`));
    if (!from && !to) continue;
    const startMin = hhmmToMinutes(from);
    const endMin = hhmmToMinutes(to);
    if (startMin === null || endMin === null || endMin <= startMin) {
      redirect(`/admin/indstillinger?fejl=${encodeURIComponent(`Arbejdstiden for ${name} er ikke gyldig. Skriv fx 09:00 og 17:00.`)}`);
    }
    hours.push({ weekday: d, startMin, endMin });
  }

  let staffId = id;
  await db.transaction(async (tx) => {
    if (id) {
      const updated = await tx
        .update(staff)
        .set({ name, active: formData.get("active") === "on" })
        .where(and(eq(staff.id, id), eq(staff.salonId, salon.id)))
        .returning();
      if (updated.length === 0) return;
    } else {
      const [created] = await tx.insert(staff).values({ name, salonId: salon.id }).returning();
      staffId = created.id;
    }
    await tx.delete(workingHours).where(eq(workingHours.staffId, staffId));
    if (hours.length) await tx.insert(workingHours).values(hours.map((h) => ({ ...h, staffId })));
  });
  savedSettings(`medarbejder-${staffId}`);
}

export async function removeWaitlistAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  await leaveWaitlist(db, { id: Number(str(formData.get("id"))), salonId: salon.id });
  revalidatePath("/admin/venteliste");
  redirect("/admin/venteliste");
}

/** Sender ledige tider til de første i køen, fx efter salonen har givet en frisør ekstra timer. */
export async function offerWaitlistAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const date = str(formData.get("date"));
  if (!isIsoDate(date)) redirect("/admin/venteliste");
  const sent = await offerFreedTime(db, salon.id, date, defaultDeps());
  revalidatePath("/admin/venteliste");
  redirect(`/admin/venteliste?sendt=${sent}`);
}
