import fs from 'fs';
import path from 'path';
import type { NextConfig } from 'next';

const hasSentrySdkInstalled = [
  path.join(__dirname, 'node_modules/@sentry/nextjs/package.json'),
  path.join(__dirname, '../../node_modules/@sentry/nextjs/package.json')
].some((candidatePath) => fs.existsSync(candidatePath));

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  webpack: (config) => {
    if (!hasSentrySdkInstalled) {
      config.resolve ??= {};
      config.resolve.alias ??= {};
      config.resolve.alias['@sentry/nextjs'] = path.join(__dirname, 'src/lib/sentry-nextjs-noop.ts');
    }

    return config;
  }
};

export default nextConfig;
