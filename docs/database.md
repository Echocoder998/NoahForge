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

Sign up and sign in with email/password. Google sign-in has been removed.
Accounts and private workspace saves remain in Neon. The production auth handler
rejects social and broker OAuth sign-in routes.

`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are configured
in Vercel. Use Projects > Import previous browser saves on the original device to
copy legacy IndexedDB/local storage projects into the signed-in account. Existing
browser copies are read only and retained. JSON project import/export remains available.

Add future application schemas as new numbered SQL migrations. Test each schema
change on an isolated Neon branch before deploying it to production.
