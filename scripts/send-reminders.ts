import { getDb } from "@/db/client";
import { defaultDeps, sendDueReminders } from "@/lib/booking";

const sent = await sendDueReminders(await getDb(), defaultDeps());
console.log(`Sendte ${sent} påmindelser.`);
process.exit(0);
