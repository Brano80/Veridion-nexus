/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['cdn.jsdelivr.net'],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://api:8080/api/:path*' },
    ];
  },
}

module.exports = nextConfig
