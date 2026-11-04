import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

// Web e API na mesma origem: o navegador só conhece /api, o Next repassa para o Nest
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
  // Os mesmos cabeçalhos que a API já manda: ninguém põe o console num iframe (clickjacking no "Aprovar")
  async headers() {
    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
    ];
    return [{ source: '/((?!api/).*)', headers }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
