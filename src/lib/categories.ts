import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { serviceCategories, services, type ServiceCategory } from "@/db/schema";

export async function listCategories(db: Db, salonId: number): Promise<ServiceCategory[]> {
  return db.query.serviceCategories.findMany({
    where: eq(serviceCategories.salonId, salonId),
    orderBy: [asc(serviceCategories.position), asc(serviceCategories.id)],
  });
}

/** Flytter et id én plads op eller ned i en liste. Returnerer listen uændret, hvis det ikke kan lade sig gøre. */
export function reorder(ids: number[], id: number, dir: "up" | "down"): number[] {
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export async function moveCategory(db: Db, salonId: number, id: number, dir: "up" | "down") {
  const ids = reorder((await listCategories(db, salonId)).map((c) => c.id), id, dir);
  await db.transaction(async (tx) => {
    for (const [position, cid] of ids.entries()) {
      await tx.update(serviceCategories).set({ position }).where(and(eq(serviceCategories.id, cid), eq(serviceCategories.salonId, salonId)));
    }
  });
}

/** Flytter en ydelse op eller ned blandt ydelserne i samme kategori. */
export async function moveService(db: Db, salonId: number, id: number, dir: "up" | "down") {
  const service = await db.query.services.findFirst({ where: and(eq(services.id, id), eq(services.salonId, salonId)) });
  if (!service) return;
  const siblings = await db.query.services.findMany({
    where: and(
      eq(services.salonId, salonId),
      service.categoryId === null ? isNull(services.categoryId) : eq(services.categoryId, service.categoryId),
    ),
    orderBy: [asc(services.position), asc(services.id)],
  });
  const ids = reorder(siblings.map((s) => s.id), id, dir);
  await db.transaction(async (tx) => {
    for (const [position, sid] of ids.entries()) await tx.update(services).set({ position }).where(eq(services.id, sid));
  });
}

/** Næste ledige plads sidst i en kategori, så nye ydelser lægger sig nederst. */
export async function nextServicePosition(db: Db, salonId: number, categoryId: number | null): Promise<number> {
  const siblings = await db.query.services.findMany({
    where: and(eq(services.salonId, salonId), categoryId === null ? isNull(services.categoryId) : eq(services.categoryId, categoryId)),
    columns: { position: true },
  });
  return siblings.reduce((max, s) => Math.max(max, s.position + 1), 0);
}

const IMAGE_TYPES: [string, (b: Buffer) => boolean][] = [
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["image/gif", (b) => b.subarray(0, 4).toString("latin1") === "GIF8"],
];

/** Finder billedtypen ud fra filens indhold, ikke filnavnet. SVG afvises, da den kan indeholde scripts. */
export function detectImageType(data: Buffer): string | null {
  return IMAGE_TYPES.find(([, test]) => data.length > 12 && test(data))?.[0] ?? null;
}
