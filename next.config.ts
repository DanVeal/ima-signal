import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static/ffprobe-static resolve their bundled binary path via
  // __dirname at require-time — bundling them (the default) rewrites that
  // path and breaks it (ENOENT under a rewritten "/ROOT/..." path). Keeping
  // them external makes Node require() them from node_modules directly, so
  // __dirname stays real.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
