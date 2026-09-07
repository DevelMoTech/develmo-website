"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PsiRow } from "@/lib/admin/performance";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

const CATEGORY_LABEL: Record<string, string> = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best practices",
  seo: "SEO",
};

// PSI's own banding: 0.9 and above is green, 0.5 and above is amber.
function tone(score: number | null): "ok" | "warn" | "danger" | "muted" {
  if (score === null) return "muted";
  return score >= 0.9 ? "ok" : score >= 0.5 ? "warn" : "danger";
}

export function PsiPanel({ runs, routes, csrf, canRun, configured }: { runs: PsiRow[]; routes: string[]; csrf: string; canRun: boolean; configured: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [path, setPath] = useState(routes[0] ?? "/");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await apiPost<{ id: string; detail?: string }>("/api/admin/performance/psi", { path, strategy }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "PageSpeed run stored", body: `${path} on ${strategy}.` });
      setOpen(res.data.id);
      router.refresh();
      return;
    }
    const raw = res.data as { detail?: string };
    toast({ kind: "error", title: "Run failed", body: raw.detail ?? describeError(res.status, res.data.error) });
  }

  const shown = runs.find((r) => r.id === open) ?? runs[0] ?? null;

  return (
    <>
      <Card title="Run PageSpeed Insights" description="Google runs Lighthouse against the URL and returns its own scores. A run takes up to a minute.">
        {!configured && <Alert kind="warn" live={false}>PSI_API_KEY is not set in the environment, so runs cannot be started from here.</Alert>}
        {canRun && configured && (
          <form className="adm-form adm-inline-form" onSubmit={run} noValidate>
            <div className="adm-field">
              <label className="adm-label" htmlFor="psi-path">Path</label>
              <select id="psi-path" className="adm-input adm-select" value={path} onChange={(e) => setPath(e.target.value)} disabled={pending}>
                {routes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="psi-strategy">Device</label>
              <select id="psi-strategy" className="adm-input adm-select" value={strategy} onChange={(e) => setStrategy(e.target.value === "desktop" ? "desktop" : "mobile")} disabled={pending}>
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
            </div>
            <div className="adm-actions">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Running" : "Run now"}</Button>
            </div>
          </form>
        )}
      </Card>

      {runs.length === 0 ? (
        <Card title="No runs yet" description="Nothing has been measured. Run one above to get a first snapshot." />
      ) : (
        <>
          <div style={{ marginBlockStart: 18 }}>
            <TableFrame>
              <div className="adm-table-wrap" tabIndex={0}>
                <table className="adm-table">
                  <caption className="adm-sr">Stored PageSpeed Insights runs</caption>
                  <thead>
                    <tr><th scope="col">Run</th><th scope="col">Route</th><th scope="col">Device</th><th scope="col">Scores</th><th scope="col"><span className="adm-sr">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Run">{fmt(r.runAt)}</td>
                        <td data-label="Route"><span className="adm-seo-path">{r.route}</span></td>
                        <td data-label="Device">{r.strategy}</td>
                        <td data-label="Scores">
                          <div className="adm-seo-flags">
                            {Object.entries(r.scores ?? {}).map(([k, v]) => (
                              <Badge key={k} tone={tone(v)}>{CATEGORY_LABEL[k] ?? k} {v === null ? "n/a" : Math.round(v * 100)}</Badge>
                            ))}
                          </div>
                        </td>
                        <td data-label="Actions" className="adm-td-actions">
                          <Button size="sm" variant={shown?.id === r.id ? "primary" : "ghost"} onClick={() => setOpen(r.id)}>Opportunities</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableFrame>
          </div>

          {shown && (
            <Card
              title={`What PageSpeed suggests for ${shown.route}`}
              description={`From the ${shown.strategy} run of ${fmt(shown.runAt)}. These are PageSpeed's own categories and wording, unedited.`}
            >
              {(shown.opportunities ?? []).length === 0 ? (
                <p className="adm-muted" style={{ margin: 0 }}>PageSpeed returned no outstanding opportunities for this run.</p>
              ) : (
                <TableFrame>
                  <div className="adm-table-wrap" tabIndex={0}>
                    <table className="adm-table adm-table-plain">
                      <caption className="adm-sr">Opportunities PageSpeed reported</caption>
                      <thead>
                        <tr><th scope="col">Opportunity</th><th scope="col">Reported</th><th scope="col">Estimated saving</th></tr>
                      </thead>
                      <tbody>
                        {(shown.opportunities ?? []).map((o) => (
                          <tr key={o.id}>
                            <td data-label="Opportunity">
                              <strong>{o.title}</strong>
                              <div className="adm-finding-detail">{o.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}</div>
                            </td>
                            <td data-label="Reported">{o.displayValue ?? <span className="adm-muted">no value</span>}</td>
                            <td data-label="Estimated saving">
                              {o.savingsMs ? `${Math.round(o.savingsMs)} ms` : o.savingsBytes ? `${Math.round(o.savingsBytes / 1024)} kB` : <span className="adm-muted">not stated</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableFrame>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
