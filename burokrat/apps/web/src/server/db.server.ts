import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type Db = BetterSQLite3Database<typeof schema>;

// A dev reload runs server modules again, so the connection lives on globalThis to keep one
// per process.
const shared = globalThis as typeof globalThis & { burokratSqlite?: Database.Database };
let instance: Db | undefined;

export function dataDir() {
  return process.env.DATA_DIR ?? "data";
}

function openSqlite() {
  mkdirSync(dataDir(), { recursive: true });
  const sqlite = new Database(join(dataDir(), "burokrat.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function getDb(): Db {
  instance ??= drizzle((shared.burokratSqlite ??= openSqlite()), { schema });
  return instance;
}

export function migrateDatabase() {
  migrate(getDb(), { migrationsFolder: "drizzle" });
}
