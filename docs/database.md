# Neon database

The Vercel project `noahforge` uses Neon project `red-math-85354467` in
`aws-us-east-1`, database `noahforge`, branch `production`.

`DATABASE_URL` is configured as an encrypted, server-only Vercel environment variable
for production and development. Keep production credentials out of preview deployments;
connect an isolated Neon branch before testing database changes.
Never commit connection strings or expose them through a `VITE_` variable.

The existing `src/lib/db.ts` client selects Postgres when `DATABASE_URL` is set.
The build runs `scripts/migrate.mjs` to apply ordered SQL files in `migrations/`.
The auth schema persists accounts. `forge_projects` stores each project separately,
with per-project revision checks and queries scoped to the verified user ID.
The project library loads names and IDs; opening a project fetches its full state.
Only the active project's structured data is autosaved after a short debounce.
Explicit saves await acknowledgement. Failed writes stay queued in memory with
an error and retry option, never a silent browser-storage fallback.

Photos use the private Vercel Blob store `noahforge-private-files`. Uploads go
directly to Blob with an authenticated, user-scoped token and a 20 MB image limit
(PNG, JPEG, WebP; three photos per notebook entry). Reads stream through an
owner-checked API route; private file URLs require the owner's session. Configure
server-only `BLOB_READ_WRITE_TOKEN` alongside `DATABASE_URL` in each environment.
Do not connect previews to production data.

The old aggregate 4 MB workspace limit no longer applies. Each project's structured
JSON has a 3.5 MB request limit, excluding stored photo bytes. The library currently
lists up to 1,000 projects. Provider storage and transfer quotas still apply.
JSON imports allow up to 100 MB; exports embed private photos for portability.

On first authenticated load, the old `forge_workspaces` record is split into project
rows and embedded photos are copied into private storage. The original row remains
an untouched backup. A migration marker is recorded only after all copies succeed;
retries do not overwrite existing project rows. Revision checks reject stale writes
from another tab/device; export unsaved work before reloading after a conflict.

Sign up and sign in with email/password. Google sign-in has been removed.
Accounts and private workspace saves remain in Neon. The production auth handler
rejects social and broker OAuth sign-in routes.

`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are configured
in Vercel. Use Projects > Import previous browser saves on the original device to
copy legacy IndexedDB/local storage projects into the signed-in account. Existing
browser copies are read only and retained. JSON project import/export remains available.

Add future application schemas as new numbered SQL migrations. Test each schema
change on an isolated Neon branch before deploying it to production.
