import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Source maps only for local bundle analysis (ANALYZE=true npm run build).
  productionBrowserSourceMaps: process.env.ANALYZE === "true",
  // React Compiler (stable in Next 16.3) — auto-memoizes components; coexists
  // with hand-written React.memo/useCallback. Requires babel-plugin-react-compiler.
  reactCompiler: true,
  experimental: {
    // Restored Turbopack build caches can emit stale Tailwind/PostCSS output.
    // Keep production styles fresh until vercel/next.js#100326 is resolved.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default withBundleAnalyzer(nextConfig);
