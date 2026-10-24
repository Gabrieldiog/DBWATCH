import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

// Web e API na mesma origem: o navegador só conhece /api, o Next repassa para o Nest
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
