import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
