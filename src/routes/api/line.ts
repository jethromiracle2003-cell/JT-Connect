import { createFileRoute } from "@tanstack/react-router";
import { hashWorkerPassword, verifyWorkerPassword } from "@/lib/auth/email-password";

const COOKIE = "__Host-grok-auth.session_token";
const WEEK = 60 * 60 * 24 * 7;

type Body = { mode?: string; name?: string; password?: string };

function cleanName(raw: string) {
  const name = raw.replace(/[\u0000-\u001F]/g, "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

async function loginEmail(displayName: string) {
  const key = displayName.normalize("NFKC").toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}@users.numberchat.app`;
}

function randomId(size = 32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

async function signToken(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${token}.${b64}`);
}

type D1Prepared = { bind(...values: unknown[]): D1Prepared };
type D1Database = {
  prepare(query: string): D1Prepared & {
    bind(...values: unknown[]): D1Prepared & {
      all<T>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
  };
  batch(statements: D1Prepared[]): Promise<unknown>;
};

function db(): D1Database {
  const binding = (globalThis as { __env__?: { DB?: D1Database } }).__env__?.DB;
  if (!binding) throw new Error("Database is not ready");
  return binding;
}

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

async function handle(request: Request) {
  try {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) return json({ message: "Sign-up is not configured.", code: "NO_SECRET" }, 500);
    const body = (await request.json()) as Body;
    const name = cleanName(body.name ?? "");
    const password = body.password ?? "";
    if (!name) return json({ message: "Enter your name.", code: "BAD_NAME" }, 400);
    if (password.length < 8) return json({ message: "Password is too short", code: "TOO_SHORT" }, 400);
    const mode = body.mode === "signin" ? "signin" : "create";
    const email = await loginEmail(name);
    const database = db();
    const existing = await database
      .prepare(
        'select u."id" as id, a."password" as password from "user" u left join "account" a on a."userId" = u."id" and a."providerId" = \'credential\' where u."email" = ? limit 1',
      )
      .bind(email)
      .all<{ id: string; password: string | null }>();
    const row = existing.results?.[0];
    if (mode === "create" && row) {
      return json(
        { message: "User already exists. Use another email.", code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
        409,
      );
    }
    if (mode === "signin") {
      if (!row?.password) return json({ message: "Invalid email or password", code: "INVALID" }, 401);
      const match = await verifyWorkerPassword({ hash: row.password, password });
      if (!match) return json({ message: "Invalid email or password", code: "INVALID" }, 401);
      const cookie = await openSession(database, secret, row.id, request);
      return json({ ok: true }, 200, cookie);
    }
    const now = new Date().toISOString();
    const userId = randomId();
    const passwordHash = await hashWorkerPassword(password);
    await database.batch([
      database
        .prepare(
          'insert into "user" ("id","name","email","emailVerified","image","createdAt","updatedAt") values (?, ?, ?, 0, null, ?, ?)',
        )
        .bind(userId, name, email, now, now),
      database
        .prepare(
          'insert into "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") values (?, ?, \'credential\', ?, ?, ?, ?)',
        )
        .bind(randomId(), userId, userId, passwordHash, now, now),
    ]);
    const cookie = await openSession(database, secret, userId, request);
    return json({ ok: true }, 200, cookie);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-up failed.";
    if (/unique/i.test(message)) {
      return json(
        { message: "User already exists. Use another email.", code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
        409,
      );
    }
    return json({ message: message.slice(0, 300), code: "AUTH_FAILED" }, 500);
  }
}

async function openSession(database: D1Database, secret: string, userId: string, request: Request) {
  const now = new Date();
  const expires = new Date(now.getTime() + WEEK * 1000).toISOString();
  const token = randomId();
  const agent = (request.headers.get("user-agent") ?? "").slice(0, 180);
  await database
    .prepare(
      'insert into "session" ("id","expiresAt","token","createdAt","updatedAt","ipAddress","userAgent","userId") values (?, ?, ?, ?, ?, \'\', ?, ?)',
    )
    .bind(randomId(), expires, token, now.toISOString(), now.toISOString(), agent, userId)
    .run();
  const signed = await signToken(token, secret);
  return `${COOKIE}=${signed}; Max-Age=${WEEK}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const Route = createFileRoute("/api/line")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
});
