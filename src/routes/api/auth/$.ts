import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

async function handle(request: Request) {
  try {
    return await auth.handler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message.slice(0, 500), {
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
