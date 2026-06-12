import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives in a git worktree nested under the parent repo, which also
  // has a lockfile. Pin the workspace root here so Next doesn't infer the parent
  // directory (which triggers the "multiple lockfiles" warning).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
