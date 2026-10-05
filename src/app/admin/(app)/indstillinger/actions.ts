"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serviceCategories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listCategories, moveCategory, moveService } from "@/lib/categories";
import { str } from "@/lib/server";

export async function saveCategoryAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  const name = str(formData.get("name")).trim().slice(0, 60);
  const description = str(formData.get("description")).trim().slice(0, 200) || null;
  if (!name) redirect("/admin/indstillinger?fejl=Kategorien skal have et navn.#kategorier");
  if (id) {
    await db
      .update(serviceCategories)
      .set({ name, description })
      .where(and(eq(serviceCategories.id, id), eq(serviceCategories.salonId, salon.id)));
  } else {
    const position = (await listCategories(db, salon.id)).length;
    await db.insert(serviceCategories).values({ salonId: salon.id, name, description, position });
  }
  revalidatePath("/admin/indstillinger");
  redirect("/admin/indstillinger#kategorier");
}

/** Sletter en kategori. Dens ydelser bliver liggende uden kategori og vises under "Andet". */
export async function deleteCategoryAction(formData: FormData) {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  await db.delete(serviceCategories).where(and(eq(serviceCategories.id, id), eq(serviceCategories.salonId, salon.id)));
  revalidatePath("/admin/indstillinger");
  redirect("/admin/indstillinger#kategorier");
}

export async function moveCategoryUpAction(formData: FormData) {
  await moveCategoryTo(formData, "up");
}

export async function moveCategoryDownAction(formData: FormData) {
  await moveCategoryTo(formData, "down");
}

async function moveCategoryTo(formData: FormData, dir: "up" | "down") {
  const { db, salon } = await requireAdmin();
  await moveCategory(db, salon.id, Number(str(formData.get("id"))), dir);
  revalidatePath("/admin/indstillinger");
  redirect("/admin/indstillinger#kategorier");
}

export async function moveServiceUpAction(formData: FormData) {
  await moveServiceTo(formData, "up");
}

export async function moveServiceDownAction(formData: FormData) {
  await moveServiceTo(formData, "down");
}

async function moveServiceTo(formData: FormData, dir: "up" | "down") {
  const { db, salon } = await requireAdmin();
  const id = Number(str(formData.get("id")));
  await moveService(db, salon.id, id, dir);
  revalidatePath("/admin/indstillinger");
  redirect(`/admin/indstillinger#ydelse-${id}`);
}
