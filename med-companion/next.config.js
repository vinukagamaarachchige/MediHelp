const development = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");
module.exports = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./.env*"] },
  images: { unoptimized: true, remotePatterns: [] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "microphone=(), geolocation=(), camera=(self)",
          },
          ...(process.env.COMPANION_ORIGIN?.startsWith("https://")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};
