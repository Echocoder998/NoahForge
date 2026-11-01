import { createServer } from "vite";

// Keep test module discovery separate from the running app's dependency cache.
const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-workspace-tests",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  await server.ssrLoadModule("/src/lib/board/build.test.ts");
  await server.ssrLoadModule("/src/lib/lab-store.test.ts");
  await server.ssrLoadModule("/src/lib/engineering/leg.test.ts");
  await server.ssrLoadModule("/src/lib/engineering/flight.test.ts");
  await server.ssrLoadModule("/src/lib/engineering/mechanical.test.ts");
  await server.ssrLoadModule("/src/lib/engineering/report.test.ts");
  await server.ssrLoadModule("/src/lib/engineering/project-file.test.ts");
  await server.ssrLoadModule("/src/lib/wire/pin-overrides.test.ts");
  await server.ssrLoadModule("/src/lib/board/netlist.test.ts");
} finally {
  await server.close();
}
