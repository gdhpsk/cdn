/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    largePageDataBytes: 128 * 10000,
    serverActions: {
      bodySizeLimit: "200gb"
    }
  }
}

module.exports = nextConfig
