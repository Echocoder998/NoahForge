import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { get } from "@vercel/blob";
import { requireUserId } from "@/lib/auth/verify.server";
export const Route = createFileRoute("/api/files/read")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          assertSameSiteRequest();
          const id = await requireUserId();
          const path = new URL(request.url).searchParams.get("path");
          if (!path?.startsWith(`users/${encodeURIComponent(id)}/`) || path.includes(".."))
            return new Response(null, { status: 404 });
          const file = await get(path, { access: "private" });
          if (!file || file.statusCode !== 200) return new Response(null, { status: 404 });
          return new Response(file.stream, {
            headers: {
              "Content-Type": file.blob.contentType,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition": "inline",
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    },
  },
});
