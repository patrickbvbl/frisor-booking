import { createDb } from "@/db/client";
import { seedDemo } from "@/db/seed";

// Kører i Vercels build (se vercel.json): migrerer databasen og opretter demosalonen, hvis den mangler.
const db = await createDb({ url: process.env.DATABASE_URL || undefined });
const salon = await seedDemo(db, process.env.SALON_SLUG || "demo");
console.log(`Databasen er opdateret. Salon klar: ${salon.name} (/book/${salon.slug})`);
process.exit(0);
