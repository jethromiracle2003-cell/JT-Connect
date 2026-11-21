/**
 * Cloudflare D1 backend. Bindings exist only after a request starts
 * (`globalThis.__env__`), so nothing here runs at module init.
 */
import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { pgToSqlite, splitSql, sqlBind } from "./sql-sqlite";

type D1Result<T> = { results?: T[]; meta?: { changes?: number } };

type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
};

type D1Database = {
  prepare(query: string): D1Prepared;
};

export interface D1Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function binding(): D1Database {
  const db = (
    globalThis as typeof globalThis & { __env__?: { DB?: D1Database } }
  ).__env__?.DB;
  if (!db) throw new Error("D1 binding DB is not available");
  return db;
}

const globalRef = globalThis as typeof globalThis & {
  __d1Ready__?: Promise<void>;
};

function ignoreSchemaDrift(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate column|already exists/i.test(message);
}

async function runStatement(db: D1Database, text: string, params: unknown[] = []) {
  const sql = pgToSqlite(text);
  const stmt = params.length
    ? db.prepare(sql).bind(...params.map(sqlBind))
    : db.prepare(sql);
  const write = /^\s*(insert|update|delete|replace)\b/i.test(sql);
  if (write && !/\breturning\b/i.test(sql)) {
    const result = await stmt.run();
    return { rows: [] as Record<string, unknown>[], changes: result.meta?.changes ?? 0 };
  }
  if (/^\s*(select|with|insert|update|delete|replace|pragma)\b/i.test(sql)) {
    const result = await stmt.all<Record<string, unknown>>();
    return { rows: result.results ?? [], changes: result.meta?.changes ?? 0 };
  }
  await stmt.run();
  return { rows: [] as Record<string, unknown>[], changes: 0 };
}

async function applyMigrations(db: D1Database): Promise<void> {
  await runStatement(
    db,
    "create table if not exists _migrations (name text primary key, applied_at text not null default (datetime('now')))",
  );
  const migrations = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const doneRows = await runStatement(db, "select name from _migrations");
  const done = doneRows.rows.map((row) => String(row.name));
  for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
    const statements = splitSql(migrations[path]);
    for (const statement of statements) {
      try {
        await runStatement(db, statement);
      } catch (err) {
        if (!ignoreSchemaDrift(err)) throw err;
      }
    }
    await runStatement(db, "insert into _migrations (name) values (?)", [name]);
  }
}

export function ensureD1Ready(): Promise<void> {
  globalRef.__d1Ready__ ??= applyMigrations(binding()).catch((err) => {
    globalRef.__d1Ready__ = undefined;
    throw err;
  });
  return globalRef.__d1Ready__;
}

export async function createD1Sql(): Promise<D1Sql> {
  await ensureD1Ready();
  const db = binding();
  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const result = await runStatement(db, text, params);
    return result.rows as T[];
  };
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as D1Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

class D1Connection implements DatabaseConnection {
  constructor(private readonly db: D1Database) {}

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const text = compiledQuery.sql.trim();
    if (/^(begin|commit|rollback|savepoint|release)\b/i.test(text)) {
      return { rows: [] };
    }
    const result = await runStatement(this.db, compiledQuery.sql, [
      ...compiledQuery.parameters,
    ]);
    return {
      rows: result.rows as O[],
      numAffectedRows: BigInt(result.changes),
    };
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    chunkSize: number,
  ): AsyncIterableIterator<QueryResult<O>> {
    const result = await this.executeQuery<O>(compiledQuery);
    const rows = result.rows;
    for (let i = 0; i < rows.length; i += chunkSize) {
      yield { rows: rows.slice(i, i + chunkSize) };
    }
  }
}

class D1Driver implements Driver {
  async init(): Promise<void> {
    await ensureD1Ready();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    await ensureD1Ready();
    return new D1Connection(binding());
  }

  async releaseConnection(): Promise<void> {}

  async beginTransaction(): Promise<void> {}

  async commitTransaction(): Promise<void> {}

  async rollbackTransaction(): Promise<void> {}

  async destroy(): Promise<void> {}
}

/** Better Auth dialect. Reads the D1 binding on first query, not at import. */
export function d1Dialect(): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new D1Driver(),
    createQueryCompiler: (): QueryCompiler => new SqliteQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>): DatabaseIntrospector =>
      new SqliteIntrospector(db),
  };
}
