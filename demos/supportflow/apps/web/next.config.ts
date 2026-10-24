import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const apiOrigin = new URL(apiUrl).origin;
const wsOrigin = apiOrigin.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";

// Inline scripts are limited to Next.js bootstrapping and the pre-paint theme script.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${apiOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the e2e suite build into its own directory alongside a dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  agentRules: false,
  transpilePackages: ["@supportflow/shared"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
