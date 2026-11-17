import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The notes route reads /data at runtime; make sure Vercel ships those files with it.
  outputFileTracingIncludes: {
    "/api/interpret": ["./data/**/*"],
  },
};

export default nextConfig;
