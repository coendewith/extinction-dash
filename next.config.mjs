/** @type {import('next').NextConfig} */

// Content-Security-Policy scoped to what the app actually loads:
// - self for the app + same-origin API routes (/api/species, /api/countries)
// - Google Fonts stylesheet + font files
// - Wikimedia/Wikipedia images (loaded client-side) and the Wikipedia REST API
// 'unsafe-inline' is required for Next.js's inline styles/scripts and the inline
// style attributes used throughout; 'unsafe-eval' is not enabled.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https://upload.wikimedia.org https://*.wikimedia.org https://*.wikipedia.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://en.wikipedia.org https://*.wikipedia.org https://*.wikimedia.org",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Species photos are loaded client-side straight from Wikimedia / Wikipedia REST.
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "**.wikipedia.org" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
