import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: 'standalone',
  // Required for external image loading (token logos, etc.)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.dexscreener.com' },
      { protocol: 'https', hostname: '**.bscscan.com' },
    ],
  },
  // Keep solc as external — it's loaded dynamically inside a Worker thread
  // and cannot be traced by the Next.js bundler for standalone output.
  serverExternalPackages: ['solc'],
  // Rewrite /chat/[id] to / so the single-page app handles URL-based conversation routing
  async rewrites() {
    return [
      {
        source: '/chat/:id',
        destination: '/',
      },
      {
        source: '/report/:id',
        destination: '/api/report/:id',
      },
    ];
  },
};

export default nextConfig;
