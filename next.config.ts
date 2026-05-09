import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@esbuild/win32-x64",
    "esbuild",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/studio",
    "@remotion/cli",
    "remotion",
    "sharp",
    "fluent-ffmpeg",
  ],
  turbopack: {
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
