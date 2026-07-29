import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // cdn.plaid.com hosts the Plaid Link script used by the Finances tab to
      // connect banks; without it Link fails to load at all.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com", // unsafe-eval needed by Next.js dev; tighten in prod
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      // Plaid Link renders its bank-login UI in an iframe from cdn.plaid.com.
      // There is no frame-src fallback here other than default-src 'self', so
      // omitting this silently blanks the connect modal in production.
      "frame-src 'self' https://cdn.plaid.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
