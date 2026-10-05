import { getDb } from "@/db/client";
import { defaultDeps, sendDueReminders } from "@/lib/booking";

// Kaldes hver time af Vercel Cron (se vercel.json), som sender "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sent = await sendDueReminders(await getDb(), defaultDeps());
  return Response.json({ sent });
}
