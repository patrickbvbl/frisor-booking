import { getDb } from "@/db/client";
import { defaultDeps, sendDueReminders } from "@/lib/booking";
import { sendRebookReminders } from "@/lib/rebooking";

// Kaldes af Vercel Cron (se vercel.json), som sender "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = await getDb();
  const sent = await sendDueReminders(db, defaultDeps());
  const rebook = await sendRebookReminders(db, defaultDeps());
  return Response.json({ sent, rebook });
}
