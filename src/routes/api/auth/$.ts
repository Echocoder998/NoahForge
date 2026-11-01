import { createFileRoute } from "@tanstack/react-router";
import { handleProductionAuth } from "@/lib/production-auth.server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleProductionAuth(request),
      POST: ({ request }) => handleProductionAuth(request),
    },
  },
});
