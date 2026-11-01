import { auth as templateAuth } from "./auth/server";

export async function handleProductionAuth(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  // Email/password only; reject old Google entry points as well as the UI removal.
  if (
    [
      "/api/auth/sign-in/oauth2",
      "/api/auth/sign-in/social",
      "/api/auth/callback/google",
      "/api/auth/oauth2/callback/grok-google",
    ].includes(path)
  )
    return Response.json(
      { message: "Sign in with email and password on the app's home page." },
      { status: 400 },
    );
  return templateAuth.handler(request);
}
