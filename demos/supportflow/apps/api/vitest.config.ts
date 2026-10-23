import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
