# Neon database

The Vercel project `noahforge` uses Neon project `red-math-85354467` in
`aws-us-east-1`, database `noahforge`, branch `production`.

Configure `DATABASE_URL` as an encrypted, server-only Vercel environment variable
for production and development, then redeploy. Attaching it currently requires
Vercel team authorization. Keep production credentials out of preview deployments;
connect an isolated Neon branch before testing database changes.
Never commit connection strings or expose them through a `VITE_` variable.

The existing `src/lib/db.ts` client selects Postgres when `DATABASE_URL` is set.
The build runs `scripts/migrate.mjs` to apply ordered SQL files in `migrations/`.
There are currently no application tables; the opt-in auth schema is not applied.
Browser workspace data continues to use its existing local storage. Creating this
database does not migrate browser data or enable accounts.

Add future application schemas as new numbered SQL migrations. Test each schema
change on an isolated Neon branch before deploying it to production.
