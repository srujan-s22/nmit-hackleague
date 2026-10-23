import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['192.168.0.93', '192.168.0.93:3000'],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;

