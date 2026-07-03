/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Species photos are loaded client-side straight from Wikimedia / Wikipedia REST.
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "**.wikipedia.org" },
    ],
  },
};

export default nextConfig;
