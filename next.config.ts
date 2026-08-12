import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Source maps only for local bundle analysis (ANALYZE=true npm run build).
  productionBrowserSourceMaps: process.env.ANALYZE === "true",
};

export default withBundleAnalyzer(nextConfig);
