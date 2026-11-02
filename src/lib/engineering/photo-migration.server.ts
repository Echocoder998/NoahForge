import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
/** Migrate embedded legacy photos once; original workspace remains an untouched backup. */
export async function externalizeLegacyPhotos(payload: string, userId: string): Promise<string> {
  const visit = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (
      typeof object.dataUrl === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/.test(object.dataUrl)
    ) {
      const [header, encoded] = object.dataUrl.split(",");
      const bytes = Buffer.from(encoded, "base64");
      const type = header.slice(5, header.indexOf(";"));
      const path = `users/${encodeURIComponent(userId)}/legacy/${createHash("sha256").update(bytes).digest("hex")}.${type.split("/")[1]}`;
      await put(path, bytes, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: type,
      });
      return { ...object, dataUrl: `/api/files/read?path=${encodeURIComponent(path)}` };
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await visit(item);
    return result;
  };
  return JSON.stringify(await visit(JSON.parse(payload)));
}
