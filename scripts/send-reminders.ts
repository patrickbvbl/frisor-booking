import { getDb } from "@/db/client";
import { defaultDeps, sendDueReminders } from "@/lib/booking";
import { sendRebookReminders } from "@/lib/rebooking";

const db = await getDb();
const sent = await sendDueReminders(db, defaultDeps());
const rebook = await sendRebookReminders(db, defaultDeps());
console.log(`Sendte ${sent} påmindelser og ${rebook} om genbooking.`);
process.exit(0);
