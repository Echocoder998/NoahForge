import { createFileRoute } from "@tanstack/react-router";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUserId } from "@/lib/auth/verify.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
export const Route = createFileRoute("/api/files/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as HandleUploadBody;
          const result = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname) => {
              assertSameSiteRequest();
              const id = await requireUserId();
              if (!pathname.startsWith(`users/${encodeURIComponent(id)}/uploads/`))
                throw new Error("Forbidden file path.");
              return {
                allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
                maximumSizeInBytes: 20_000_000,
                addRandomSuffix: true,
                allowOverwrite: false,
              };
            },
          });
          return Response.json(result);
        } catch {
          return Response.json({ error: "Upload not authorized or unavailable." }, { status: 400 });
        }
      },
    },
  },
});
