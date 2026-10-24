import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", migrate: "src/db/migrate.ts", demo: "src/db/demo.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  // Bundle the workspace package; keep npm dependencies external.
  noExternal: ["@supportflow/shared"],
});
