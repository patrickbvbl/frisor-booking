import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Opretter en databaseforbindelse og kører migrationer.
 * Uden DATABASE_URL bruges PGlite (Postgres i WebAssembly), så projektet kører lokalt uden installation.
 * dataDir "memory://" giver en tom database i hukommelsen, som testene bruger.
 */
export async function createDb(opts: { url?: string; dataDir?: string; migrate?: boolean } = {}): Promise<Db> {
  if (opts.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // Få forbindelser pr. instans, da Vercel kan starte mange instanser mod samme database.
    const db = drizzle(new Pool({ connectionString: opts.url, max: 5 }), { schema });
    if (opts.migrate !== false) await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL mangler. Tilføj en Postgres-database til projektet i Vercel (Storage) og deploy igen.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = opts.dataDir ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.startsWith("memory://")) await mkdir(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

/**
 * Fælles forbindelse for appen. Genbruges på tværs af hot reload i udvikling.
 * På Vercel køres migrationer i build (npm run db:setup), så samtidige kolde starter ikke migrerer om kap.
 */
export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= createDb({ url: process.env.DATABASE_URL || undefined, migrate: !process.env.VERCEL });
  return globalForDb.dbPromise;
}
