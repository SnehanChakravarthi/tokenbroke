import { defineConfig } from "tsup";
import packageJson from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  // Single self-contained file: @tokenbroke/shared is inlined so the published
  // package has zero workspace deps and npx startup stays fast.
  noExternal: ["@tokenbroke/shared"],
  define: { __TOKENBROKE_CLI_VERSION__: JSON.stringify(packageJson.version) },
  clean: true,
  minify: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
});
