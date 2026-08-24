import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @tokenbroke/shared is consumed as TypeScript source, not a built package.
  transpilePackages: ["@tokenbroke/shared"],
};

export default nextConfig;
