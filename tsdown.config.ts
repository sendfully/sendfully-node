import { defineConfig } from "tsdown";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  hash: false,
  // `define` lives under `inputOptions.transform` because rolldown's
  // `TransformOptions.define` is the substitution pass that runs during bundling.
  // The top-level tsdown `define` option is not wired through in 0.12.9.
  inputOptions: {
    transform: {
      define: {
        __SDK_VERSION__: JSON.stringify(pkg.version),
      },
    },
  },
});
