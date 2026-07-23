import { Database } from "bun:sqlite";
import { z, type ZodType } from "zod";

export type SqliteRow = Record<string, unknown>;
export type SqlBinding = string | number | bigint | boolean | null | Uint8Array;

export function openSharedSqlite(
  path = process.env.SOLARD_DB_PATH ?? "./solard.db",
): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

/**
 * Small shared SQLite + Zod boundary. SQL remains explicit while every row
 * crossing between the SQD writer and the web reader is parsed by one schema.
 */
export class SqliteZodTable<T extends SqliteRow> {
  constructor(
    readonly db: Database,
    readonly schema: ZodType<T>,
  ) {}

  one(sql: string, bindings: SqlBinding[] = []): T | null {
    const row = this.db.query<SqliteRow, SqlBinding[]>(sql).get(...bindings);
    return row ? this.schema.parse(row) : null;
  }

  many(sql: string, bindings: SqlBinding[] = []): T[] {
    return this.db
      .query<SqliteRow, SqlBinding[]>(sql)
      .all(...bindings)
      .map((row) => this.schema.parse(row));
  }

  run(sql: string, bindings: SqlBinding[] = []): void {
    this.db.run(sql, bindings);
  }
}

export { z };
