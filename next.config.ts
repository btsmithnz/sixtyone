import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  cacheLife: {
    /**
     * Election results. The scraper revalidates the "results" tag as soon as
     * new data arrives, so this is only a safety net:
     *  - stale: browsers reuse a prefetched page for 30s
     *  - revalidate: regenerate in the background at most hourly. Each rebuild
     *    re-reads the database, so keep this long and let the tag do the work
     *  - expire: after a day with no traffic, regenerate before serving
     */
    results: { stale: 30, revalidate: 3600, expire: 86_400 },
  },
  async headers() {
    return [
      {
        // Content-hashed map sprite (scripts/build-map.ts): cache forever.
        source: "/map/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
