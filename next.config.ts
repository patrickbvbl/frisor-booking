import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite indlæser WebAssembly-filer fra node_modules og må ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Kundeimport sender CSV-filen gennem en server action. Vercel tillader højst 4,5 MB pr. forespørgsel.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
