import type { StateStorage } from "zustand/middleware";

let database: Promise<IDBDatabase> | undefined;
let lastWrite = 0;
const openDatabase = () =>
  (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("noah-forge-projects", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
async function readDatabase(key: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}
async function writeDatabase(key: string, value: string | null): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    const store = tx.objectStore("projects");
    if (value === null) store.delete(key);
    else store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const revision = (value: string | null) => {
  try {
    return JSON.parse(value || "null")?._savedAt || 0;
  } catch {
    return -1;
  }
};
const issue = () =>
  window.dispatchEvent(
    new CustomEvent("noah-forge-storage-error", {
      detail:
        "Browser storage is unavailable. Keep this page open and export your project to preserve your work.",
    }),
  );

/** IndexedDB holds complete projects/photos; small legacy saves remain portable. */
export const projectStorage: StateStorage = {
  async getItem(key) {
    let local: string | null = null;
    try {
      local = localStorage.getItem(key);
    } catch {
      /* IDB can still work. */
    }
    try {
      const stored = await readDatabase(key);
      return revision(local) > revision(stored) || !stored ? local : stored;
    } catch {
      return local;
    }
  },
  async setItem(key, value) {
    const stamped = JSON.stringify({
      ...JSON.parse(value),
      _savedAt: (lastWrite = Math.max(Date.now(), lastWrite + 1)),
    });
    let mirrored = false;
    try {
      if (stamped.length < 1_500_000) {
        localStorage.setItem(key, stamped);
        mirrored = true;
      } else localStorage.removeItem(key);
    } catch {
      /* Large projects are stored in IndexedDB. */
    }
    try {
      await writeDatabase(key, stamped);
    } catch {
      if (!mirrored) issue();
    }
  },
  async removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* continue */
    }
    try {
      await writeDatabase(key, null);
    } catch {
      issue();
    }
  },
};
