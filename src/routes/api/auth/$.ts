import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

async function handle(request: Request) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname.endsWith("/sign-up/email")) {
    try {
      const { ensureD1Ready } = await import("@/lib/d1");
      await ensureD1Ready();
      return new Response("migrations-ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      return new Response(message.slice(0, 4000), {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
  try {
    return await auth.handler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message.slice(0, 4000), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
