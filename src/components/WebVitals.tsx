"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { isMetric, isPlausible, MAX_SAMPLES_PER_BATCH, normaliseRoute, type MetricName } from "@/lib/perf/vitals";

// First-party Core Web Vitals (brief §3.8). No third-party script and no
// third-party origin: the batch is posted to this site's own /api/vitals,
// which the existing Content Security Policy already allows through
// connect-src 'self'. Nothing here needs a CSP change.
//
// Sampling keeps the volume sane on a marketing site; batching with
// sendBeacon means the report never blocks navigation and survives the page
// being closed. Delivery is best effort by design: a dropped sample is a
// missing data point, never a broken page.

// A quarter of page views in production. NEXT_PUBLIC_VITALS_SAMPLE_RATE
// overrides it, which local development and the e2e set to 1 so the console
// has data to show rather than a coin toss.
function sampleRate(): number {
  const raw = Number(process.env.NEXT_PUBLIC_VITALS_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.25;
}
const SAMPLE_RATE = sampleRate();
const ENDPOINT = "/api/vitals";
// LCP, FCP and TTFB settle early; this sends them during the visit so a
// dropped unload beacon does not lose them. CLS and INP arrive later and go
// out when the page is hidden.
const FLUSH_AFTER_MS = 2_500;

type Pending = { metric: MetricName; value: number };

export function WebVitals() {
  const pathname = usePathname();
  const pending = useRef<Pending[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One coin toss per page view, so a sampled visit reports all of its
  // metrics rather than a random few, which would skew the p75.
  const sampled = useRef<boolean | null>(null);
  // The callback handed to useReportWebVitals has to keep the same
  // identity or metrics are re-reported, so the current route reaches it
  // through a ref that a navigation updates.
  const routeRef = useRef(pathname);
  useEffect(() => {
    routeRef.current = pathname;
  }, [pathname]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const samples = pending.current;
    if (samples.length === 0) return;
    pending.current = [];
    const body = JSON.stringify({ route: normaliseRoute(routeRef.current || "/"), samples: samples.slice(0, MAX_SAMPLES_PER_BATCH) });
    try {
      // sendBeacon is queued by the browser and delivered even while the
      // page is unloading. It is governed by connect-src, which allows
      // 'self'. fetch with keepalive covers browsers without it.
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, blob)) return;
      void fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    } catch {
      // Reporting must never surface to the visitor.
    }
  }, []);

  const report = useCallback(
    (metric: { name: string; value: number }) => {
      if (sampled.current === null) sampled.current = Math.random() < SAMPLE_RATE;
      if (!sampled.current) return;
      if (!isMetric(metric.name) || !isPlausible(metric.name, metric.value)) return;
      pending.current.push({ metric: metric.name, value: metric.value });
      if (pending.current.length >= MAX_SAMPLES_PER_BATCH) {
        flush();
        return;
      }
      if (!timer.current) timer.current = setTimeout(flush, FLUSH_AFTER_MS);
    },
    [flush],
  );

  useReportWebVitals(report);

  // A visit that ends before the timer still reports: the browser delivers
  // a beacon queued from pagehide, and visibilitychange covers the mobile
  // case where pagehide may not fire.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  return null;
}
