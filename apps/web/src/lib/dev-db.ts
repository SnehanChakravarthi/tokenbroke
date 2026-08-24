import type { Database } from "./db";
import { getDatabase } from "./db";
import { seedFictionalBoard } from "./dev-seed";

declare global {
  var tokenbrokeDevDatabase: Promise<Database> | undefined;
}

/**
 * Database for site pages. Production requires DATABASE_URL; anywhere else, `bun run dev` gets a
 * memoized in-process PGlite seeded with FICTIONAL devices so the board renders with zero setup.
 * Fiction never reaches production: the fallback throws when NODE_ENV === "production".
 */
export async function siteDatabase(): Promise<Database> {
  if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") return getDatabase();
  globalThis.tokenbrokeDevDatabase ??= (async () => {
    const { createPGliteDatabase } = await import("./db");
    const database = await createPGliteDatabase();
    await seedFictionalBoard(database);
    return database;
  })().catch((error: unknown) => {
    // Never memoize a failure: the next request should retry a fresh seed.
    globalThis.tokenbrokeDevDatabase = undefined;
    throw error;
  });
  return globalThis.tokenbrokeDevDatabase;
}
