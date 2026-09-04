// Core Web Vitals (brief §3.8). Pure module: shared by the public reporter,
// the API route and the console, and unit tested. No imports, so it bundles
// into the client without pulling anything server-side along.

export const METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type MetricName = (typeof METRICS)[number];

export const DEVICE_CLASSES = ["mobile", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export function isMetric(v: unknown): v is MetricName {
  return typeof v === "string" && (METRICS as readonly string[]).includes(v);
}

// Google's published thresholds. CLS is unitless; the rest are milliseconds.
export const THRESHOLDS: Record<MetricName, { good: number; poor: number; unit: "ms" | "score" }> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "score" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
};

export type Rating = "good" | "needs-improvement" | "poor";

export function rate(metric: MetricName, value: number): Rating {
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  return value <= t.poor ? "needs-improvement" : "poor";
}

export function formatMetric(metric: MetricName, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "no data";
  return THRESHOLDS[metric].unit === "score" ? value.toFixed(3) : `${Math.round(value)} ms`;
}

// A sane upper bound per metric, so a broken client cannot poison the p75
// with an absurd number. Anything beyond this is dropped, not clamped.
const CEILING: Record<MetricName, number> = { LCP: 120_000, INP: 120_000, CLS: 100, FCP: 120_000, TTFB: 120_000 };

export function isPlausible(metric: MetricName, value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= CEILING[metric];
}

// The route a sample belongs to. Real paths are collapsed onto the route
// pattern that produced them, so /our-blogs/some-post is counted under
// /our-blogs/[slug] rather than creating a row per post. Anything that is
// not a known public shape is bucketed as "other", so the table cannot be
// grown without bound by arbitrary URLs.
const DYNAMIC_SEGMENTS: [RegExp, string][] = [
  [/^\/our-blogs\/[^/]+$/, "/our-blogs/[slug]"],
  [/^\/our-knowledge-base\/[^/]+$/, "/our-knowledge-base/[slug]"],
  [/^\/jobs\/[^/]+$/, "/jobs/[slug]"],
  [/^\/what-we-do\/[^/]+$/, "/what-we-do/[slug]"],
  [/^\/who-we-help\/[^/]+$/, "/who-we-help/[slug]"],
  [/^\/our-products\/[^/]+$/, "/our-products/[slug]"],
];

const STATIC_ROUTES = new Set([
  "/",
  "/what-we-do",
  "/who-we-help",
  "/our-products",
  "/our-products/crowdiq",
  "/who-we-are",
  "/who-we-are/about-develmo",
  "/our-knowledge-base",
  "/our-blogs",
  "/jobs",
  "/contact-develmo",
  "/case-studies",
  "/privacy",
  "/terms",
  "/cookies",
]);

export function normaliseRoute(pathname: string): string {
  let p = (pathname || "/").trim();
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (STATIC_ROUTES.has(p)) return p;
  for (const [re, pattern] of DYNAMIC_SEGMENTS) if (re.test(p)) return pattern;
  // The console is never measured here, and neither is anything unknown.
  return "other";
}

// Device class from the user agent. Two buckets only, because that is what
// the console reports against and what field data is usually split by.
export function deviceClassFrom(userAgent: string | null | undefined): DeviceClass {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "desktop";
  const mobile = /android|iphone|ipod|iemobile|blackberry|opera mini|mobile safari|windows phone/.test(ua);
  // A tablet reads as desktop-class for layout purposes but mobile for
  // network; iPad reports as Macintosh on modern iOS, so it lands in
  // desktop either way and the split stays honest rather than guessed.
  return mobile ? "mobile" : "desktop";
}

// p75 of a sorted-or-unsorted list, the same nearest-rank definition
// Postgres percentile_cont approximates and CrUX publishes.
export function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.75 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// What the reporter sends. One POST carries a batch for one route.
export type VitalsBatch = {
  route: string;
  samples: { metric: MetricName; value: number }[];
};

export const MAX_SAMPLES_PER_BATCH = 20;
