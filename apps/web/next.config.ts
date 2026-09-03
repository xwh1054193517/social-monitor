import type { NextConfig } from "next";

// Sub-path under which the whole web app is served in production
// (e.g. https://www.eternalstar.xyz/web3/monitor). Empty in local dev.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  // standalone output is enabled only inside Docker (Linux) where symlinks work.
  // Set STANDALONE=true in the Dockerfile build stage.
  ...(process.env.STANDALONE === "true" ? { output: "standalone" as const } : {}),
  transpilePackages: ["@social-monitor/shared"]
};

export default nextConfig;
