import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { splitWorkspace } from "./project-envelope";
async function migrate(userId: string) {
  const { getSql } = await import("../db");
  const sql = await getSql();
  if ((await sql`SELECT 1 FROM forge_project_migrations WHERE user_id=${userId}`).length) return;
  const rows = await sql<{
    payload: string;
  }>`SELECT payload FROM forge_workspaces WHERE user_id=${userId}`;
  if (rows[0]) {
    const { externalizeLegacyPhotos } = await import("./photo-migration.server");
    for (const row of splitWorkspace(rows[0].payload).records) {
      const payload = await externalizeLegacyPhotos(row.payload, userId);
      await sql`INSERT INTO forge_projects(user_id,project_id,name,payload) VALUES(${userId},${row.id},${row.name},${payload}) ON CONFLICT DO NOTHING`;
    }
  }
  await sql`INSERT INTO forge_project_migrations(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
}
export const readWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await migrate(context.userId).catch((error: unknown) => {
      console.error(
        "Project migration failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    });
    const { getSql } = await import("../db");
    const sql = await getSql();
    const list = await sql<{
      project_id: string;
      name: string;
    }>`SELECT project_id,name FROM forge_projects WHERE user_id=${context.userId} ORDER BY updated_at DESC LIMIT 1000`;
    const rows = list[0]
      ? await sql<{
          payload: string;
          revision: number;
        }>`SELECT payload,revision FROM forge_projects WHERE user_id=${context.userId} AND project_id=${list[0].project_id}`
      : [];
    const projects = list.map((row) => ({
      id: row.project_id,
      savedAt: 0,
      remote: true,
      state: { projectId: row.project_id, projectName: row.name },
      design: null,
    }));
    const payload = rows[0]
      ? JSON.stringify({
          ...JSON.parse(rows[0].payload),
          state: { ...JSON.parse(rows[0].payload).state, projects },
        })
      : null;
    return { payload, revision: rows[0]?.revision ?? 0, projectId: list[0]?.project_id ?? null };
  });
export const readCloudProject = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().min(1).max(120))
  .handler(async ({ context, data }) => {
    await migrate(context.userId).catch((error: unknown) => {
      console.error(
        "Project migration failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    });
    const { getSql } = await import("../db");
    const sql = await getSql();
    const rows = await sql<{
      payload: string;
      revision: number;
    }>`SELECT payload,revision FROM forge_projects WHERE user_id=${context.userId} AND project_id=${data}`;
    if (!rows[0]) throw new Error("Project not found.");
    return rows[0];
  });
export const writeWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ payload: z.string().max(3500000), revision: z.number().int().nonnegative() }),
  )
  .handler(async ({ context, data }) => {
    if (new TextEncoder().encode(data.payload).length > 3500000)
      throw new Error(
        "This project's structured data exceeds 3.5 MB. Export a backup and reduce its restore points.",
      );
    const row = splitWorkspace(data.payload).records.at(-1)!;
    const id = z.string().min(1).max(120).parse(row.id);
    if (row.payload.includes("data:image/"))
      throw new Error("Upload embedded photos before saving the project.");
    const { getSql } = await import("../db");
    const sql = await getSql();
    const inserted = await sql<{
      revision: number;
    }>`INSERT INTO forge_projects(user_id,project_id,name,payload) SELECT ${context.userId},${id},${row.name},${row.payload} WHERE ${data.revision}=0 ON CONFLICT DO NOTHING RETURNING revision`;
    if (inserted[0]) return inserted[0];
    const updated = await sql<{
      revision: number;
    }>`UPDATE forge_projects SET payload=${row.payload},name=${row.name},revision=revision+1,updated_at=now() WHERE user_id=${context.userId} AND project_id=${id} AND revision=${data.revision} RETURNING revision`;
    if (!updated[0])
      throw new Error(
        "Another tab saved this project. Export your work and reload before continuing.",
      );
    return updated[0];
  });
