/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    largePageDataBytes: 128 * 1000000,
    serverActions: {
      bodySizeLimit: "200gb"
    }
  }
}

module.exports = nextConfig
