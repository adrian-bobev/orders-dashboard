import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone for Docker deployment
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
};

export default nextConfig;
