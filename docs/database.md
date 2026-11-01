# Neon database

The Vercel project `noahforge` uses Neon project `red-math-85354467` in
`aws-us-east-1`, database `noahforge`, branch `production`.

`DATABASE_URL` is configured as an encrypted, server-only Vercel environment variable
for production and development. Keep production credentials out of preview deployments;
connect an isolated Neon branch before testing database changes.
Never commit connection strings or expose them through a `VITE_` variable.

The existing `src/lib/db.ts` client selects Postgres when `DATABASE_URL` is set.
The build runs `scripts/migrate.mjs` to apply ordered SQL files in `migrations/`.
The auth schema and `forge_workspaces` table persist accounts and private workspaces.
Every workspace read/write verifies the session and scopes the query to its user ID.
The complete Zustand workspace (named projects, restore points, designs, notes,
engineering work, and chat) is autosaved to Postgres after a short debounce.
Explicit saves await database acknowledgement. Revision checks reject stale writes
from another tab/device; export unsaved work before reloading after a conflict.
Failed saves remain in memory with an error and retry option, never browser storage.
The UI warns before leaving with unconfirmed writes. Workspaces are limited to 4 MB.

Email/password sign-in is available. Direct Google sign-in is wired through
`src/lib/production-auth.server.ts`, which extends the template's existing auth
options with the native Google provider and shares its session cookies, secret,
and Neon database. The template's shared preview OAuth client is not valid for
this production domain; requests to the old broker sign-in endpoint are rejected.

Google remains unavailable until these setup steps are complete:

1. In Google Cloud > Google Auth Platform, configure Noah Forge's branding and
   audience. Use only the basic OpenID, email, and profile scopes. While the
   consent app is in Testing, add the intended users as test users.
2. Create an OAuth client of type Web application. Set the authorized JavaScript
   origin to `https://noahforge.vercel.app` and the authorized redirect URI to
   `https://noahforge.vercel.app/api/auth/callback/google` (exact match).
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the Vercel project's
   Production environment as encrypted server-only variables, then redeploy.
   Never paste the secret into a commit or a client-visible variable.
4. Verify a complete sign-in, return to the app, save, and reload using Google.

The Google button checks server readiness before redirecting. Missing credentials
produce an in-app message with the email/password alternative, not a broken broker
redirect. A redirect to Google's login page alone does not verify the callback.

`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are configured
in Vercel. Use Projects > Import previous browser saves on the original device to
copy legacy IndexedDB/local storage projects into the signed-in account. Existing
browser copies are read only and retained. JSON project import/export remains available.

Add future application schemas as new numbered SQL migrations. Test each schema
change on an isolated Neon branch before deploying it to production.
