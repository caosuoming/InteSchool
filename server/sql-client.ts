import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool, type PoolClient } from "pg";
import type { ServerConfig } from "./config.js";

export interface SqlResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlConnection {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<SqlResult<T>>;
}

export interface SqlClient extends SqlConnection {
  readonly kind: "postgres" | "pglite";
  transaction<T>(task: (client: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PgSqlClient implements SqlClient {
  readonly kind = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  async query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<SqlResult<T>> {
    const result = await this.pool.query(text, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(task: (client: SqlConnection) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await task(new PgTransactionConnection(client));
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PgTransactionConnection implements SqlConnection {
  constructor(private readonly client: PoolClient) {}

  async query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<SqlResult<T>> {
    const result = await this.client.query(text, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }
}

export async function createSqlClient(config: ServerConfig): Promise<SqlClient> {
  if (config.databaseUrl) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    const client = new PgSqlClient(pool);
    await client.query("SELECT 1");
    return client;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置 INTESCHOOL_DATABASE_URL（PostgreSQL 连接串）");
  }

  await mkdir(dirname(config.databasePath), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(`${config.databasePath}.pglite`);
  await db.waitReady;

  return {
    kind: "pglite",
    async query<T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<SqlResult<T>> {
      const result = await db.query<T>(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    async transaction<T>(task: (client: SqlConnection) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => task({
        async query<R = Record<string, unknown>>(
          text: string,
          params: unknown[] = [],
        ): Promise<SqlResult<R>> {
          const result = await tx.query<R>(text, params);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        },
      }));
    },
    async close(): Promise<void> {
      await db.close();
    },
  };
}
