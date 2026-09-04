// PageSpeed Insights (brief §3.8). The categories, scores and opportunities
// are reported exactly as PSI returns them: no re-weighting, no scoring of
// our own, no invented grade. If PSI changes what it reports, this changes
// with it.

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 90_000;

// PSI runs Lighthouse, which takes a while.
export const PSI_CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

export type PsiOpportunity = {
  id: string;
  title: string;
  description: string;
  // Milliseconds or bytes, as PSI states it; the unit comes with it.
  displayValue: string | null;
  savingsMs: number | null;
  savingsBytes: number | null;
  score: number | null;
};

export type PsiSnapshot = {
  // Category id -> score in 0..1, or null when PSI did not return one.
  scores: Record<string, number | null>;
  opportunities: PsiOpportunity[];
  // The lab metrics PSI reports alongside the score.
  metrics: Record<string, { value: number; display: string }>;
  fetchedUrl: string | null;
  lighthouseVersion: string | null;
};

type LighthouseAudit = {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  details?: { type?: string; overallSavingsMs?: number; overallSavingsBytes?: number };
};

type PsiResponse = {
  lighthouseResult?: {
    requestedUrl?: string;
    finalUrl?: string;
    lighthouseVersion?: string;
    categories?: Record<string, { score?: number | null; auditRefs?: { id: string; group?: string }[] }>;
    audits?: Record<string, LighthouseAudit>;
  };
  error?: { message?: string };
};

const LAB_METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interaction-to-next-paint"];

export type PsiResult = { ok: true; snapshot: PsiSnapshot } | { ok: false; error: string };

export function psiConfigured(): boolean {
  return !!process.env.PSI_API_KEY;
}

// Shapes the response without interpreting it. Exported so the unit tests
// can drive it with a recorded payload rather than the network.
export function shapeSnapshot(data: PsiResponse): PsiSnapshot {
  const lh = data.lighthouseResult ?? {};
  const audits = lh.audits ?? {};
  const scores: Record<string, number | null> = {};
  for (const [id, category] of Object.entries(lh.categories ?? {})) {
    scores[id] = typeof category.score === "number" ? category.score : null;
  }

  // PSI groups the audits it considers opportunities and diagnostics; the
  // ids come from the category's own auditRefs, so the list is PSI's, not
  // a set this code decided on.
  const perfRefs = lh.categories?.performance?.auditRefs ?? [];
  const opportunityIds = perfRefs.filter((r) => r.group === "load-opportunities" || r.group === "diagnostics").map((r) => r.id);
  const opportunities: PsiOpportunity[] = [];
  for (const id of opportunityIds) {
    const a = audits[id];
    if (!a) continue;
    // Audits PSI marks as passed or not applicable are not opportunities.
    if (a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "informative") continue;
    if (typeof a.score === "number" && a.score >= 0.9) continue;
    opportunities.push({
      id,
      title: a.title ?? id,
      description: a.description ?? "",
      displayValue: a.displayValue ?? null,
      savingsMs: typeof a.details?.overallSavingsMs === "number" ? a.details.overallSavingsMs : null,
      savingsBytes: typeof a.details?.overallSavingsBytes === "number" ? a.details.overallSavingsBytes : null,
      score: typeof a.score === "number" ? a.score : null,
    });
  }
  opportunities.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0));

  const metrics: PsiSnapshot["metrics"] = {};
  for (const id of LAB_METRICS) {
    const a = audits[id];
    if (a && typeof a.numericValue === "number") metrics[id] = { value: a.numericValue, display: a.displayValue ?? String(a.numericValue) };
  }

  return {
    scores,
    opportunities,
    metrics,
    fetchedUrl: lh.finalUrl ?? lh.requestedUrl ?? null,
    lighthouseVersion: lh.lighthouseVersion ?? null,
  };
}

export async function runPsi(url: string, strategy: "mobile" | "desktop"): Promise<PsiResult> {
  const key = process.env.PSI_API_KEY;
  if (!key) return { ok: false, error: "PSI_API_KEY is not set in the environment, so PageSpeed Insights cannot be called." };
  const query = new URLSearchParams({ url, strategy, key });
  for (const c of PSI_CATEGORIES) query.append("category", c);
  try {
    const res = await fetch(`${ENDPOINT}?${query}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = (await res.json()) as PsiResponse;
    if (!res.ok) return { ok: false, error: data.error?.message ?? `PageSpeed Insights answered ${res.status}` };
    if (!data.lighthouseResult) return { ok: false, error: "PageSpeed Insights returned no Lighthouse result for that URL." };
    return { ok: true, snapshot: shapeSnapshot(data) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
