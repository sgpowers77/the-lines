import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the `out/` folder can be deployed to Cloudflare Pages as-is.
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
