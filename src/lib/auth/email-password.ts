/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Off by default. To enable: set `emailAndPasswordEnabled` to `true` below,
 * then build sign-up / sign-in forms with `authClient.signUp.email` /
 * `authClient.signIn.email` from `@/lib/auth/client` (see the auth skill).
 *
 * Do NOT edit `server.ts` for this — that file is frozen pre-wired config.
 *
 * Cloudflare's free Worker CPU budget cannot run Better Auth's default scrypt
 * (N=16384). Signup there uses PBKDF2-SHA256 instead. Preview keeps scrypt.
 */
export const emailAndPasswordEnabled = true;

const ITERATIONS = 10;

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Fast enough for a Workers CPU limit. Stored as `pbkdf2:<rounds>:<salt>:<hash>`. */
export async function hashWorkerPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${bytesToHex(salt)}:${hash}`;
}

export async function verifyWorkerPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const [kind, rounds, saltHex, digest] = hash.split(":");
  if (kind !== "pbkdf2" || !rounds || !saltHex || !digest) return false;
  const iterations = Number(rounds);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const actual = await pbkdf2(password, hexToBytes(saltHex), iterations);
  return sameHex(actual, digest);
}
