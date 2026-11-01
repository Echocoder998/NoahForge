import { createServerFn } from "@tanstack/react-start";

export const googleSignInStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { googleConfigured } = await import("./production-auth.server");
  return { configured: googleConfigured };
});
