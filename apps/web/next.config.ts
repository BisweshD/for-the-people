import type { NextConfig } from "next";

/**
 * Everything the app loads is its own: scripts, styles, self-hosted fonts and portraits, and fetches to
 * its own API. Next.js writes inline bootstrap scripts and style attributes, so script-src and
 * style-src allow 'unsafe-inline' (there is no dangerouslySetInnerHTML anywhere to exploit it);
 * nonces would make every page dynamic. `next dev` also needs eval for fast refresh.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  // Previews stay out of search engines until the owner approves a public launch.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Browsers ignore this over plain http (local development); it pins HTTPS on any real host.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Each build worker loads the local civic database; limit parallel copies on development machines.
  experimental: { cpus: 2 },
  typedRoutes: true,
  transpilePackages: ["@for-the-people/core", "@for-the-people/data"],
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
