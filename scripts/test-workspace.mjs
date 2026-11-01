import { createServer } from "vite";

// Keep test module discovery separate from the running app's dependency cache.
const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-workspace-tests",
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  await server.ssrLoadModule("/src/lib/board/build.test.ts");
  await server.ssrLoadModule("/src/lib/lab-store.test.ts");
} finally {
  await server.close();
}
