import type { StateStorage } from "zustand/middleware";
import { splitWorkspace } from "./project-envelope";
import { readCloudProject, readWorkspace, writeWorkspace } from "./cloud-workspace";

const revisions = new Map<string, number>();
const confirmed = new Map<string, string>();
let loaded = false;
const pending = new Map<string, string>();
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let status = "Loading cloud workspace…";
const report = (message: string) => {
  status = message;
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("noah-forge-cloud-status", { detail: message }));
};
export const cloudStatus = () => status;
export const hasUnsavedChanges = () => pending.size > 0 || running !== null;

/** Resolves only after the latest queued state is acknowledged by Postgres. */
export async function flushCloudSave(): Promise<void> {
  clearTimeout(timer);
  if (running) {
    await running;
    return flushCloudSave();
  }
  if (!loaded) throw new Error("Cloud workspace has not loaded. Reload before saving.");
  if (pending.size === 0) return;
  running = (async () => {
    while (pending.size) {
      const [id, raw] = pending.entries().next().value!;
      report("Saving to cloud...");
      const { uploadInlinePhotos } = await import("./private-photos");
      const clean = await uploadInlinePhotos(raw);
      if (confirmed.get(id) !== clean) {
        const result = await writeWorkspace({
          data: { payload: clean, revision: revisions.get(id) ?? 0 },
        });
        revisions.set(id, result.revision);
        confirmed.set(id, clean);
        window.dispatchEvent(
          new CustomEvent("noah-forge-project-saved", {
            detail: { id, name: JSON.parse(clean).state.projectName },
          }),
        );
      }
      if (pending.get(id) === raw) pending.delete(id);
    }
    report("Saved to cloud");
  })();
  try {
    await running;
  } catch (error) {
    report(
      `Not saved: ${error instanceof Error ? error.message : "Connection failed. Retry saving."}`,
    );
    throw error;
  } finally {
    running = null;
  }
}

/** Cloud is the only save destination. No silent browser fallback. */
export const projectStorage: StateStorage = {
  async getItem() {
    loaded = false;
    const result = await readWorkspace();
    if (result.projectId) revisions.set(result.projectId, result.revision);
    loaded = true;
    report(result.payload ? "Saved to cloud" : "Cloud workspace ready");
    return result.payload;
  },
  setItem(_key, value) {
    if (!loaded) return;
    const { records } = splitWorkspace(value);
    for (const record of records) pending.set(record.id, record.payload);
    report("Unsaved changes");
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flushCloudSave().catch(() => undefined);
    }, 700);
  },
  removeItem() {
    throw new Error("Export your workspace before replacing it.");
  },
};

/** Read-only import from the previous browser-based version. */
export async function readLegacyWorkspace(): Promise<string | null> {
  let local: string | null = null;
  try {
    local = localStorage.getItem("airframe-lab");
  } catch {
    /* optional legacy source */
  }
  const stored = await new Promise<string | null>((resolve) => {
    const request = indexedDB.open("noah-forge-projects", 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      resolve(null);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.close();
        resolve(null);
        return;
      }
      const get = db.transaction("projects").objectStore("projects").get("airframe-lab");
      get.onsuccess = () => {
        db.close();
        resolve(typeof get.result === "string" ? get.result : null);
      };
      get.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  });
  const time = (value: string | null) => {
    try {
      return JSON.parse(value || "null")?._savedAt || 0;
    } catch {
      return -1;
    }
  };
  return !stored || time(local) > time(stored) ? local : stored;
}

export async function loadCloudProject(id: string) {
  await flushCloudSave();
  const row = await readCloudProject({ data: id });
  revisions.set(id, row.revision);
  confirmed.set(id, row.payload);
  return JSON.parse(row.payload).state;
}
