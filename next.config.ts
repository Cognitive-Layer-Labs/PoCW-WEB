import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Next.js App Router streams its payload through inline <script> tags, so
// script-src needs 'unsafe-inline' (nonces would force every page to render
// dynamically). The map renders to <canvas>. Google profile photos come from
// lh3.googleusercontent.com. Sign-in is a top-level GET navigation to
// accounts.google.com (a link, then a redirect), which CSP does not restrict,
// so form-action and connect-src stay 'self'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // better-sqlite3 is a native module: keep it out of the bundle and copy its
  // Linux prebuilds (glibc + musl, x64 + arm64) and the Open Graph fonts into
  // the standalone output, since both are loaded through computed paths.
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/better-sqlite3/prebuilds/linux*.node", "./src/assets/fonts/*.woff"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/verify", destination: "/", permanent: false },
      { source: "/history", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
