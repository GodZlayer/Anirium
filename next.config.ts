import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === "true" || process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: isExport ? "export" : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "api.anirium.com.br" }],
        destination: "https://anirium.com.br",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.myanimelist.net",
      },
      {
        protocol: "https",
        hostname: "**.anilist.co",
      },
      {
        protocol: "https",
        hostname: "**.unsplash.com",
      },
    ],
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
