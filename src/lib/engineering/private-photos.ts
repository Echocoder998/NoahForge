import { upload } from "@vercel/blob/client";
import { newUploadPath } from "./file-upload";
export async function uploadPrivatePhoto(file: File | Blob, name = "Photo") {
  if (file.size > 20_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image up to 20 MB.");
  const { path } = await newUploadPath();
  const blob = await upload(path, file, {
    access: "private",
    handleUploadUrl: "/api/files/upload",
    contentType: file.type,
    multipart: file.size > 4_000_000,
  });
  return {
    name: name.slice(0, 150),
    dataUrl: `/api/files/read?path=${encodeURIComponent(blob.pathname)}`,
  };
}
const uploaded = new Map<string, string>();
export async function uploadInlinePhotos(payload: string) {
  const visit = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (
      typeof object.dataUrl === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/.test(object.dataUrl)
    ) {
      let url = uploaded.get(object.dataUrl);
      if (!url) {
        const blob = await (await fetch(object.dataUrl)).blob();
        url = (
          await uploadPrivatePhoto(blob, typeof object.name === "string" ? object.name : "Photo")
        ).dataUrl;
        uploaded.set(object.dataUrl, url);
      }
      return { ...object, dataUrl: url };
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await visit(item);
    return result;
  };
  return JSON.stringify(await visit(JSON.parse(payload)));
}
export async function portablePhotos<T>(value: T): Promise<T> {
  const visit = async (item: unknown): Promise<unknown> => {
    if (Array.isArray(item)) return Promise.all(item.map(visit));
    if (!item || typeof item !== "object") return item;
    const object = item as Record<string, unknown>;
    if (typeof object.dataUrl === "string" && object.dataUrl.startsWith("/api/files/read?path=")) {
      const response = await fetch(object.dataUrl);
      if (!response.ok) throw new Error("Could not export a private photo. Sign in and retry.");
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Photo export failed."));
        r.readAsDataURL(blob);
      });
      return { ...object, dataUrl };
    }
    const result: Record<string, unknown> = {};
    for (const [key, itemValue] of Object.entries(item)) result[key] = await visit(itemValue);
    return result;
  };
  return (await visit(value)) as T;
}
