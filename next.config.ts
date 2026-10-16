import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // lib/skill.ts reads skills/*/SKILL.md at runtime, so make sure Vercel bundles them with the API routes.
  outputFileTracingIncludes: {
    "/api/*": ["./skills/**/*"],
  },
};

export default nextConfig;
