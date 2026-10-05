import { getDb } from "@/db/client";
import { seedDemo } from "@/db/seed";

const salon = await seedDemo(await getDb(), process.env.SALON_SLUG || "demo");
console.log(`Demosalon klar: ${salon.name} (/book/${salon.slug})`);
process.exit(0);
