import { betterAuth } from "better-auth";
import { auth as templateAuth } from "./auth/server";

// Extend the template without changing its database, session cookies, secret,
// gate integration, or preview helpers. All sessions use the same Neon tables.
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
export const googleConfigured = Boolean(clientId && clientSecret);
export const productionAuth = betterAuth({
  ...templateAuth.options,
  socialProviders: googleConfigured
    ? { google: { clientId: clientId!, clientSecret: clientSecret!, prompt: "select_account" } }
    : {},
  account: {
    ...templateAuth.options.account,
    accountLinking: {
      ...templateAuth.options.account.accountLinking,
      trustedProviders: [...templateAuth.options.account.accountLinking.trustedProviders, "google"],
    },
  },
});

export async function handleProductionAuth(request: Request): Promise<Response> {
  // Never send production visitors through the template's shared preview client.
  if (new URL(request.url).pathname === "/api/auth/sign-in/oauth2")
    return Response.json(
      { message: "Use Google or email sign-in on the app's home page." },
      { status: 400 },
    );
  return productionAuth.handler(request);
}
