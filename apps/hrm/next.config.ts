import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/db", "@repo/ui"],
  experimental: {
    // Interview takes upload via server actions (webm can be large)
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
