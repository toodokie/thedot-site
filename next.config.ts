import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow production builds to complete even if there are TypeScript errors
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
