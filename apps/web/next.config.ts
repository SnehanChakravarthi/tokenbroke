import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Lab-leads' avatars proxied through the image optimizer: the visitor's
    // browser only ever talks to us; Vercel fetches unavatar server-side.
    remotePatterns: [{ protocol: "https", hostname: "unavatar.io" }],
  },
  // @tokenbroke/shared is consumed as TypeScript source, not a built package.
  transpilePackages: ["@tokenbroke/shared"],
  // PGlite (dev-only seeded database) ships WASM assets that must be loaded by Node, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // OG cards read fonts + the wordmark off disk at render time; make sure tracing bundles them.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/og/fonts/*.ttf", "./public/tokenbroke-3d.png"],
    "/u/[name]/opengraph-image": ["./src/og/fonts/*.ttf", "./public/tokenbroke-3d.png"],
    "/manifest/opengraph-image": ["./src/og/fonts/*.ttf", "./public/tokenbroke-3d.png"],
  },
};

export default nextConfig;
