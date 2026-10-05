import { eq } from "drizzle-orm";
import { salonImages } from "@/db/schema";
import { appDb } from "@/lib/server";

/** Viser et billede salonen har lagt op. Billeder ændres aldrig, et nyt billede får et nyt id, så de kan caches længe. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Ikke fundet", { status: 404 });
  const db = await appDb();
  const image = await db.query.salonImages.findFirst({ where: eq(salonImages.id, id) });
  if (!image) return new Response("Ikke fundet", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
