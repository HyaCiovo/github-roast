import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home dir makes Next infer the wrong workspace root.
  // Pin it to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
