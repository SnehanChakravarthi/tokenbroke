import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export interface DatabaseResult<Row extends QueryResultRow = QueryResultRow> {
  rows: Row[];
  rowCount: number;
}

export interface DatabaseQuery {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseResult<Row>>;
}

export interface Database extends DatabaseQuery {
  transaction<T>(operation: (tx: DatabaseQuery) => Promise<T>): Promise<T>;
  close?: () => Promise<void>;
}

declare global {
  var tokenbrokePool: Pool | undefined;
  var tokenbrokeDatabaseOverride: Database | undefined;
}

function wrapPgQuery(queryable: Pick<Pool | PoolClient, "query">): DatabaseQuery {
  return {
    async query<Row extends QueryResultRow>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<DatabaseResult<Row>> {
      const result = await queryable.query<Row>(text, [...values]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

function productionDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required at request time");
  if (!globalThis.tokenbrokePool) {
    globalThis.tokenbrokePool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000 });
    attachDatabasePool(globalThis.tokenbrokePool);
  }
  const pool = globalThis.tokenbrokePool;
  const base = wrapPgQuery(pool);
  return {
    ...base,
    async transaction<T>(operation: (tx: DatabaseQuery) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await operation(wrapPgQuery(client));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function getDatabase(): Database {
  return globalThis.tokenbrokeDatabaseOverride ?? productionDatabase();
}

/** Test-only injection point used by directly imported route handlers. */
export function setDatabaseForTests(database: Database | undefined): void {
  globalThis.tokenbrokeDatabaseOverride = database;
}

export async function createPGliteDatabase(): Promise<Database> {
  const [{ PGlite }, { drizzle }, { migrate }, schema] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("./db/schema"),
  ]);
  const client = new PGlite();
  await client.waitReady;
  const orm = drizzle(client, { schema });
  await migrate(orm, {
    migrationsFolder: resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
  });
  const wrap = (queryable: Pick<typeof client, "query">): DatabaseQuery => ({
    async query<Row extends QueryResultRow>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<DatabaseResult<Row>> {
      const result = await queryable.query<Row>(text, [...values]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(client),
    async transaction<T>(operation: (tx: DatabaseQuery) => Promise<T>): Promise<T> {
      return client.transaction((tx) => operation(wrap(tx)));
    },
    close: () => client.close(),
  };
}
