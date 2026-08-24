import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @tokenbroke/shared is consumed as TypeScript source, not a built package.
  transpilePackages: ["@tokenbroke/shared"],
  // PGlite (dev-only seeded database) ships WASM assets that must be loaded by Node, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
