import { getDb } from "@/db/client";
import { isAdmin } from "@/lib/auth";
import { getSalonBySlug } from "@/lib/booking";
import { listCustomers, toCsv } from "@/lib/customers";

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const salon = await getSalonBySlug(db, process.env.SALON_SLUG || "demo");
  if (!salon) return new Response("Not found", { status: 404 });
  const rows = await listCustomers(db, salon.id);
  const csv = toCsv([
    ["Navn", "Telefon", "E-mail", "Oprettet", "Besøg", "Udeblevet", "Note"],
    ...rows.map((c) => [c.name, c.phone, c.email, c.createdAt.toISOString().slice(0, 10), c.visits, c.noShows, c.note]),
  ]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kunder-${salon.slug}.csv"`,
    },
  });
}
