import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['192.168.0.93', '192.168.0.93:3000', '127.0.0.1', '[::1]', '::1'],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;

