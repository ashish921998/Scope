import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@scope/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@scope/types": resolve(__dirname, "packages/types/src/index.ts")
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/core/src/**/*.ts"]
    }
  }
});
