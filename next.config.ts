import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM + data files that are loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Local recordings, caches and the embedded database live in ./data; never bundle or trace them.
  outputFileTracingExcludes: { "*": ["./data/**/*", "./scripts/**/*"] },
  // Migrations are read at runtime from ./drizzle.
  outputFileTracingIncludes: { "*": ["./drizzle/**/*"] },
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
