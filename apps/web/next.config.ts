import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const hasSentrySdkInstalled = [
  path.join(__dirname, 'node_modules/@sentry/nextjs/package.json'),
  path.join(__dirname, '../../node_modules/@sentry/nextjs/package.json')
].some((candidatePath) => fs.existsSync(candidatePath));

function getBuildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  serverExternalPackages: ['bullmq'],
  env: {
    NEXT_PUBLIC_BUILD_ID: getBuildId()
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

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
