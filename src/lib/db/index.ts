import path from "node:path";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Holder = { db: DB; ready: Promise<void> };
const globalForDb = globalThis as unknown as { __pestlaunchDb?: Holder };

async function create(): Promise<Holder> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(url), { schema });
    // The query API is identical across drivers; the cast keeps one DB type for the app.
    return { db: db as unknown as DB, ready: migrate(db, { migrationsFolder: MIGRATIONS }) };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(path.join(process.cwd(), "data", "pglite"));
  const db = drizzlePglite(client, { schema });
  return { db, ready: migrate(db, { migrationsFolder: MIGRATIONS }) };
}

let pending: Promise<Holder> | undefined;

/** Returns a migrated database handle. Safe to call from anywhere on the server. */
export async function getDb(): Promise<DB> {
  if (!globalForDb.__pestlaunchDb) {
    pending ??= create().then((h) => (globalForDb.__pestlaunchDb = h));
    await pending;
  }
  const holder = globalForDb.__pestlaunchDb!;
  await holder.ready;
  return holder.db;
}

export { schema };
