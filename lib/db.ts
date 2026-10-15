import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs/promises";
import { emptyWorkspace, type Workspace } from "./types";
export const dataDir = () => path.resolve(process.env.DATA_DIR || ".data");
type Query = { query: (sql: string, params?: any[]) => Promise<any> };
const globalDb = globalThis as unknown as {
  learnDb?: Promise<Query>;
  learnLock?: Promise<void>;
};
async function initializeDatabase(): Promise<Query> {
  await fs.mkdir(dataDir(), { recursive: true });
  const connection = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
      })
    : new PGlite(path.join(dataDir(), "postgres"));
  let client: (Query & { release?: () => void }) | undefined;
  let locked = false;
  try {
    client =
      connection instanceof Pool ? await connection.connect() : connection;
    if (connection instanceof Pool) {
      await client.query("SELECT pg_advisory_lock(20261015)");
      locked = true;
    }
    await client.query(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS workspaces (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT now())`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,owner TEXT,lease_until TIMESTAMPTZ,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status,created_at)`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL)`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS content_chunks (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_id TEXT NOT NULL,page INTEGER NOT NULL,content TEXT NOT NULL,search TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple',content)) STORED)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS chunks_search_idx ON content_chunks USING GIN(search)`,
    );
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT`,
    );
    return connection;
  } catch (e) {
    if (connection instanceof Pool) void connection.end();
    throw e;
  } finally {
    if (locked)
      await client
        ?.query("SELECT pg_advisory_unlock(20261015)")
        .catch(() => {});
    client?.release?.();
  }
}
export async function db(): Promise<Query> {
  if (!globalDb.learnDb)
    globalDb.learnDb = initializeDatabase().catch((error) => {
      globalDb.learnDb = undefined;
      throw error;
    });
  return globalDb.learnDb;
}
export async function getWorkspace(userId: string): Promise<Workspace> {
  const conn = await db();
  const r = await conn.query("SELECT data FROM workspaces WHERE user_id=$1", [
    userId,
  ]);
  return r.rows[0]?.data || emptyWorkspace();
}
// Both database backends serialize workspace updates in transactions. Dedicated PG connection keeps locks scoped correctly.
export async function mutate<T>(
  userId: string,
  fn: (w: Workspace) => T | Promise<T>,
): Promise<T> {
  const previous = globalDb.learnLock || Promise.resolve();
  let release!: () => void;
  globalDb.learnLock = new Promise((r) => {
    release = r;
  });
  await previous;
  let client: (Query & { release?: () => void }) | undefined;
  let transactionOpen = false;
  try {
    const base = await db();
    client = base instanceof Pool ? await base.connect() : base;
    await client.query("BEGIN");
    transactionOpen = true;
    const row = await client.query(
      "SELECT data FROM workspaces WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    const w: Workspace = row.rows[0]?.data || emptyWorkspace();
    const result = await fn(w);
    await client.query(
      `INSERT INTO workspaces(user_id,data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`,
      [userId, JSON.stringify(w)],
    );
    await client.query("COMMIT");
    return result;
  } catch (e) {
    if (client && transactionOpen)
      await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client?.release?.();
    release();
  }
}
