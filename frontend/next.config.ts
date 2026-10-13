import type { NextConfig } from "next";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  // Sin NEXT_PUBLIC_API_URL (desarrollo local), /api se reenvía al FastAPI local.
  async rewrites() {
    return apiUrl ? [] : [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};

export default nextConfig;
