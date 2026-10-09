import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite indlæser WebAssembly-filer fra node_modules og må ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Kundeimport sender CSV-filen gennem en server action. Vercel tillader højst 4,5 MB pr. forespørgsel.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      // Kundens sider (booking, aftalekort, venteliste, betaling) må vises i en ramme på salonens egen hjemmeside.
      // Alt andet, især admin, må ikke, så ingen kan narre frisøren til at klikke i en skjult kopi af kalenderen.
      {
        source: "/:path((?!book/|b/|venteliste/|pay/|billeder/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      { source: "/embed.js", headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
