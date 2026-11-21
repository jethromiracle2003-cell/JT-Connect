/**
 * Postgres SQL used by this app, rewritten just enough to run on D1 (SQLite).
 * Preview still uses PGLite and never calls this.
 *
 * Timestamps are stored as `YYYY-MM-DD HH:MM:SS` (what `datetime('now')` returns)
 * so text comparison matches `now() - interval` rewrites. JS Dates are bound in
 * that same shape.
 */

export function pgToSqlite(text: string): string {
  let sql = text;
  sql = sql.replace(
    /now\(\)\s*-\s*interval\s+'(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days)'/gi,
    "datetime('now', '-$1 $2')",
  );
  sql = sql.replace(
    /now\(\)\s*\+\s*\(\s*(\$\d+|\?)\s*\*\s*interval\s+'1 second'\s*\)/gi,
    "datetime('now', '+' || $1 || ' seconds')",
  );
  sql = sql.replace(/\bdefault\s+now\(\)/gi, "default (datetime('now'))");
  sql = sql.replace(/\bnow\(\)/gi, "datetime('now')");
  sql = sql.replace(/::(?:timestamptz|text|integer|boolean)/gi, "");
  sql = sql.replace(/\bis\s+distinct\s+from\b/gi, "!=");
  // D1 accepts UPDATE ... FROM, but not a target-table alias (`update t alias`).
  sql = sql.replace(
    /update\s+conversation_members\s+cm\s+set\s+role\s*=\s*'admin'\s+from\s+conversations\s+c\s+where\s+c\.id\s*=\s*cm\.conversation_id\s+and\s+c\.kind\s*=\s*'group'\s+and\s+c\.created_by\s*=\s*cm\.user_id\s+and\s+cm\.role\s*!=\s*'admin'/gi,
    "update conversation_members set role = 'admin' from conversations c where c.id = conversation_members.conversation_id and c.kind = 'group' and c.created_by = conversation_members.user_id and conversation_members.role != 'admin'",
  );
  sql = sql.replace(
    /number\s+~\s+'\^\[0-9\]\{10\}\$'/g,
    "length(number) = 10 and number not glob '*[^0-9]*'",
  );
  sql = sql.replace(/\bilike\b/gi, "like");
  sql = sql.replace(/\btimestamptz\b/gi, "text");
  sql = sql.replace(/\bboolean\b/gi, "integer");
  sql = sql.replace(/\bdefault\s+false\b/gi, "default 0");
  sql = sql.replace(/\bdefault\s+true\b/gi, "default 1");
  sql = sql.replace(/\s=\s*false\b/gi, " = 0");
  sql = sql.replace(/\s=\s*true\b/gi, " = 1");
  sql = sql.replace(
    /\balter\s+table\s+(\S+)\s+add\s+column\s+if\s+not\s+exists\s+/gi,
    "alter table $1 add column ",
  );
  sql = sql.replace(/\$\d+/g, "?");
  return sql;
}

export function sqlBind(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (value === undefined) return null;
  return value;
}

export function splitSql(script: string): string[] {
  return script
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.replace(/--[^\n]*/g, "").trim().length > 0);
}
