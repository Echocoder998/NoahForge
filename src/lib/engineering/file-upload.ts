import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
export const newUploadPath = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => ({
    path: `users/${encodeURIComponent(context.userId)}/uploads/${crypto.randomUUID()}`,
  }));
