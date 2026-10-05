import { createDb } from "@/db/client";

await createDb({ url: process.env.DATABASE_URL || undefined });
console.log("Databasen er opdateret.");
process.exit(0);
