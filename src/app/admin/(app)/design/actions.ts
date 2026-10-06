"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { salonImages, salons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { detectImageType } from "@/lib/categories";
import {
  addBlock,
  BLOCK_TYPES,
  defaultDesign,
  moveBlock,
  parseDesign,
  removeBlock,
  updateBlock,
  updateTheme,
  mapEmbedUrl,
  type BlockType,
  type Design,
} from "@/lib/design";
import { str } from "@/lib/server";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

async function edit(change: (design: Design, ctx: Awaited<ReturnType<typeof requireAdmin>>) => Promise<Design> | Design, anchor = "") {
  const ctx = await requireAdmin();
  const next = await change(parseDesign(ctx.salon.design), ctx);
  await ctx.db.update(salons).set({ design: next }).where(eq(salons.id, ctx.salon.id));
  // Uden dette viser browseren den gamle side, når kun #-delen af adressen skifter.
  revalidatePath("/admin/design");
  redirect(`/admin/design?gemt=1${anchor ? `#${anchor}` : ""}`);
}

function fail(msg: string, anchor = ""): never {
  redirect(`/admin/design?fejl=${encodeURIComponent(msg)}${anchor ? `#${anchor}` : ""}`);
}

export async function saveThemeAction(formData: FormData) {
  await edit(
    (d) =>
      updateTheme(d, {
        accent: str(formData.get("accent")),
        background: str(formData.get("background")),
        headingFont: str(formData.get("headingFont")) as never,
        bodyFont: str(formData.get("bodyFont")) as never,
        corners: str(formData.get("corners")) as never,
      }),
    "tema",
  );
}

export async function paletteAction(formData: FormData) {
  const [accent, background] = str(formData.get("palette")).split(",");
  await edit((d) => updateTheme(d, { accent, background }), "tema");
}

export async function moveBlockUpAction(formData: FormData) {
  const id = str(formData.get("id"));
  await edit((d) => moveBlock(d, id, "up"), `blok-${id}`);
}

export async function moveBlockDownAction(formData: FormData) {
  const id = str(formData.get("id"));
  await edit((d) => moveBlock(d, id, "down"), `blok-${id}`);
}

export async function toggleBlockAction(formData: FormData) {
  const id = str(formData.get("id"));
  await edit((d) => updateBlock(d, id, {}, !d.blocks.find((b) => b.id === id)?.hidden), `blok-${id}`);
}

export async function removeBlockAction(formData: FormData) {
  const id = str(formData.get("id"));
  await edit(async (d, { db, salon }) => {
    const block = d.blocks.find((b) => b.id === id);
    if (block?.type === "hero") await deleteImages(db, salon.id, [block.props.logoId, block.props.imageId]);
    return removeBlock(d, id);
  }, "blokke");
}

export async function addBlockAction(formData: FormData) {
  const type = str(formData.get("type")) as BlockType;
  if (!BLOCK_TYPES.includes(type)) fail("Vælg hvilken slags blok du vil tilføje.", "blokke");
  await edit((d) => addBlock(d, type), "blokke");
}

export async function resetDesignAction() {
  await edit(() => defaultDesign());
}

/**
 * Gemmer en bloks felter. Felterne læses ud fra blokkens nuværende værdier: tekst fra tekstfelter,
 * ja/nej fra afkrydsningsfelter (et felt der ikke er krydset af, sendes ikke med) og billeder fra filfelter.
 */
export async function saveBlockAction(formData: FormData) {
  const id = str(formData.get("id"));
  await edit(async (d, { db, salon }) => {
    const block = d.blocks.find((b) => b.id === id);
    if (!block) return d;
    const props: Record<string, unknown> = {};
    const replaced: (number | null)[] = [];
    for (const [key, current] of Object.entries(block.props)) {
      if (typeof current === "boolean") props[key] = formData.get(key) === "on";
      else if (key === "mapUrl") {
        const pasted = str(formData.get(key)).trim();
        const url = pasted ? mapEmbedUrl(pasted) : "";
        if (url === null) {
          fail("Vi kunne ikke finde et kort i koden. Gå til Google Maps, tryk Del, vælg Integrer et kort og kopiér HTML.", `blok-${id}`);
        }
        props[key] = url;
      } else if (typeof current === "string") props[key] = str(formData.get(key)).trim();
      else {
        const file = formData.get(key);
        if (formData.get(`${key}Remove`) === "on") {
          props[key] = null;
          replaced.push(current);
        } else if (file instanceof File && file.size > 0) {
          if (file.size > MAX_IMAGE_BYTES) fail("Billedet er for stort. Det må højst fylde 3 MB.", `blok-${id}`);
          const data = Buffer.from(await file.arrayBuffer());
          const mime = detectImageType(data);
          if (!mime) fail("Billedet skal være JPG, PNG, WebP eller GIF.", `blok-${id}`);
          const [img] = await db.insert(salonImages).values({ salonId: salon.id, mime, data }).returning({ id: salonImages.id });
          props[key] = img.id;
          replaced.push(current);
        }
      }
    }
    await deleteImages(db, salon.id, replaced);
    return updateBlock(d, id, props);
  }, `blok-${id}`);
}

async function deleteImages(db: Awaited<ReturnType<typeof requireAdmin>>["db"], salonId: number, ids: (number | null)[]) {
  const real = ids.filter((x): x is number => typeof x === "number");
  if (real.length) await db.delete(salonImages).where(and(eq(salonImages.salonId, salonId), inArray(salonImages.id, real)));
}
