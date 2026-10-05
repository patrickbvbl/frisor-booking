import { getDb } from "@/db/client";

// getDb kører migrationerne, når forbindelsen oprettes.
await getDb();
console.log("Databasen er opdateret.");
process.exit(0);
