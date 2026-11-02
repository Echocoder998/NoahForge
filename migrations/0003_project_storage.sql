CREATE TABLE IF NOT EXISTS forge_projects (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 name text NOT NULL,
 payload text NOT NULL CHECK(octet_length(payload) <= 4000000),
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, project_id)
);
CREATE INDEX IF NOT EXISTS forge_projects_user_updated ON forge_projects(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS forge_project_migrations (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 migrated_at timestamptz NOT NULL DEFAULT now()
);
