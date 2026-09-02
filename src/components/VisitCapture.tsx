"use client";

import { useEffect } from "react";

// First-touch attribution for the contact form (brief §3.5): on the first
// page of a visit, remember the landing page, the external referrer and any
// utm_* parameters in sessionStorage. Renders nothing and changes nothing
// visible; the contact form reads the record when it submits.

export const VISIT_KEY = "dm_visit";

export type VisitRecord = { landingPage: string; referrer: string; utm: Record<string, string> };

export function readVisit(): VisitRecord | null {
  try {
    const raw = window.sessionStorage.getItem(VISIT_KEY);
    return raw ? (JSON.parse(raw) as VisitRecord) : null;
  } catch {
    return null;
  }
}

export function VisitCapture() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(VISIT_KEY)) return;
      const utm: Record<string, string> = {};
      new URLSearchParams(window.location.search).forEach((v, k) => {
        if (/^utm_[a-z_]+$/i.test(k) && v) utm[k.toLowerCase()] = v.slice(0, 200);
      });
      const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer.slice(0, 500) : "";
      const record: VisitRecord = { landingPage: (window.location.pathname + window.location.search).slice(0, 500), referrer, utm };
      window.sessionStorage.setItem(VISIT_KEY, JSON.stringify(record));
    } catch {
      // Storage unavailable (private mode, blocked): attribution is simply absent.
    }
  }, []);
  return null;
}
