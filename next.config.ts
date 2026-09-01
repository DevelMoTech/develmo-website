import type { NextConfig } from "next";

// Pragmatic CSP: allows the origins this site actually uses (Google Fonts,
// Google reCAPTCHA, Sanity CDN). Inline scripts/styles are permitted for
// Next's runtime and JSON-LD; tightening to a nonce-based policy is a follow-up.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://cdn.sanity.io",
  "connect-src 'self' https://www.google.com https://api.resend.com https://*.sanity.io",
  "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com https://www.youtube.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

// Starter 301 map from the old WordPress URLs. Finalize from a full URL audit
// of the live site before launch (see README "Migration").
const redirects = [
  { source: "/home", destination: "/", permanent: true },
  { source: "/about", destination: "/who-we-are", permanent: true },
  { source: "/about-us", destination: "/who-we-are", permanent: true },
  { source: "/services", destination: "/what-we-do", permanent: true },
  { source: "/industries", destination: "/who-we-help", permanent: true },
  { source: "/products", destination: "/our-products", permanent: true },
  { source: "/crowdiq", destination: "/our-products/crowdiq", permanent: true },
  { source: "/blog", destination: "/our-blogs", permanent: true },
  { source: "/careers", destination: "/jobs", permanent: true },
  { source: "/contact", destination: "/contact-develmo", permanent: true },
  { source: "/contact-us", destination: "/contact-develmo", permanent: true },
  // PadelIQ slug was renamed from the legacy rpf-padel-league.
  { source: "/our-products/rpf-padel-league", destination: "/our-products/padeliq", permanent: true },
];

// Long-lived, immutable caching for static media in /public. These assets are
// content-stable, so a 1-year immutable cache is safe and removes the default
// max-age=0 that forced a revalidation on every visit. (Next already serves
// /_next/static immutably; this covers the hand-placed public assets.)
const nextConfig: NextConfig = {
  // `next build` clears the whole dist directory, including the `dev/` subtree a
  // running `next dev` keeps its Turbopack state in — which makes that dev server
  // die with "FATAL: An unexpected Turbopack error occurred / Next.js package not
  // found". Set NEXT_DIST_DIR=.next-build to run a verification build alongside a
  // live dev server. Unset (Vercel, plain `npm run build`) keeps the default.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/(.*)\\.(jpg|jpeg|png|gif|webp|avif|svg|ico|mp4|webm|woff|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async redirects() {
    return redirects;
  },
};

export default nextConfig;
