import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite indlæser WebAssembly-filer fra node_modules og må ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
