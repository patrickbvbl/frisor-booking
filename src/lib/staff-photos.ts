import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { salonImages, staff } from "@/db/schema";
import { detectImageType } from "./categories";

export const MAX_STAFF_PHOTO_BYTES = 3 * 1024 * 1024;

/** Tjekker et uploadet billede af en medarbejder. Returnerer en fejltekst til salonen, eller null hvis billedet er i orden. */
export function staffPhotoError(data: Buffer): string | null {
  if (data.length > MAX_STAFF_PHOTO_BYTES) return "Billedet er for stort. Det må højst fylde 3 MB.";
  if (!detectImageType(data)) return "Billedet skal være JPG, PNG, WebP eller GIF.";
  return null;
}

/**
 * Giver en medarbejder et nyt billede (data) eller fjerner billedet (null). Det gamle billede slettes,
 * så salonen ikke samler ubrugte billeder op. Kaster en fejl, hvis billedet ikke er gyldigt.
 */
export async function setStaffPhoto(db: Db, salonId: number, staffId: number, data: Buffer | null): Promise<void> {
  const member = await db.query.staff.findFirst({ where: and(eq(staff.id, staffId), eq(staff.salonId, salonId)) });
  if (!member) return;
  let photoId: number | null = null;
  if (data) {
    const error = staffPhotoError(data);
    if (error) throw new Error(error);
    const [img] = await db
      .insert(salonImages)
      .values({ salonId, mime: detectImageType(data)!, data })
      .returning({ id: salonImages.id });
    photoId = img.id;
  }
  await db.update(staff).set({ photoId }).where(eq(staff.id, staffId));
  if (member.photoId) await db.delete(salonImages).where(and(eq(salonImages.id, member.photoId), eq(salonImages.salonId, salonId)));
}
