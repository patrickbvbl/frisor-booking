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
export async function createDb(opts: { url?: string; dataDir?: string } = {}): Promise<Db> {
  if (opts.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const db = drizzle(new Pool({ connectionString: opts.url }), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
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

/** Fælles forbindelse for appen. Genbruges på tværs af hot reload i udvikling. */
export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= createDb({ url: process.env.DATABASE_URL || undefined });
  return globalForDb.dbPromise;
}
