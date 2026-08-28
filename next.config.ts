import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    // Content-Security-Policy: built specifically for this app's needs.
    // - 'self' for scripts/styles/images/fonts/connections
    // - data: for images (base64 profile photos, PDF previews)
    // - blob: for PDF generation (pdf-lib/jspdf)
    // - https://vercel.live for Vercel preview toolbar
    // - unsafe-inline for styles (Next.js injects inline styles; Tailwind requires it)
    //   Note: scripts do NOT include unsafe-inline — Next.js uses nonces/hashes
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://vercel.live wss: ws:",
      "media-src 'self' data: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
      {
        // Apply cache-control and nosniff to API routes, but NOT Content-Type
        // since upload/download endpoints need different content types
        source: "/api/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        // Prevent browser from caching the main HTML page so users always
        // get the latest version after deploys/updates (fixes "stale UI").
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
