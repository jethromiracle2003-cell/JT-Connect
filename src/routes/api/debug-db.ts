import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug-db")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const env = (globalThis as typeof globalThis & { __env__?: { DB?: { prepare: (q: string) => { all: () => Promise<{ results?: unknown[] }> } } } }).__env__;
        let d1 = "missing";
        try {
          if (env?.DB) {
            const rows = await env.DB.prepare("select 1 as ok").all();
            d1 = JSON.stringify(rows.results ?? rows);
          }
        } catch (err) {
          d1 = err instanceof Error ? err.message : String(err);
        }
        let hash = "skipped";
        try {
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode("testpass123"),
            "PBKDF2",
            false,
            ["deriveBits"],
          );
          await crypto.subtle.deriveBits(
            { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100 },
            key,
            256,
          );
          hash = "ok";
        } catch (err) {
          hash = err instanceof Error ? err.message : String(err);
        }
        return Response.json({
          runtime: process.env.APP_RUNTIME ?? "",
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
          bindings: env ? Object.keys(env) : [],
          d1,
          hash,
          ms: Date.now() - started,
        });
      },
    },
  },
});
