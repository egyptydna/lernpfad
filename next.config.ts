import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  logging: { incomingRequests: false },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pdfjs-dist",
    "mammoth",
    "pg",
    "@napi-rs/canvas",
  ],
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};
export default config;
