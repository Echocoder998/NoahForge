import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";

export const readWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const sql = await getSql();
    const rows = await sql<{ payload: string; revision: number }>`
      SELECT payload, revision FROM forge_workspaces WHERE user_id = ${context.userId}`;
    return rows[0] ?? { payload: null, revision: 0 };
  });

export const writeWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ payload: z.string().max(4_000_000), revision: z.number().int().nonnegative() }),
  )
  .handler(async ({ context, data }) => {
    if (new TextEncoder().encode(data.payload).length > 4_000_000)
      throw new Error("Workspace exceeds 4 MB. Export a backup and reduce attached photos.");
    const parsed = JSON.parse(data.payload);
    if (!parsed?.state || typeof parsed.state !== "object" || Array.isArray(parsed.state))
      throw new Error("Invalid workspace.");
    const { getSql } = await import("../db");
    const sql = await getSql();
    // A stale tab cannot replace changes saved by another tab/device.
    const rows = await sql<{ revision: number }>`
      INSERT INTO forge_workspaces (user_id, payload, revision)
      SELECT ${context.userId}, ${data.payload}, 1 WHERE ${data.revision} = 0
      ON CONFLICT (user_id) DO NOTHING RETURNING revision`;
    if (rows[0]) return rows[0];
    const updated = await sql<{ revision: number }>`
      UPDATE forge_workspaces SET payload = ${data.payload}, revision = revision + 1, updated_at = now()
      WHERE user_id = ${context.userId} AND revision = ${data.revision} RETURNING revision`;
    if (!updated[0])
      throw new Error(
        "Another tab or device saved changes. Export your work, then reload before continuing.",
      );
    return updated[0];
  });
