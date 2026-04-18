import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
