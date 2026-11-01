CREATE TABLE IF NOT EXISTS forge_workspaces (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  payload text NOT NULL CHECK (octet_length(payload) <= 4000000),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
