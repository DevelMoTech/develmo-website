"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DependencyRun } from "@/lib/admin/security";
import { SEVERITIES, type Severity } from "@/lib/security/deps-types";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

const TONE: Record<Severity, "danger" | "warn" | "info" | "muted"> = {
  critical: "danger",
  high: "danger",
  moderate: "warn",
  low: "info",
  info: "muted",
};

export function DependencyPanel({ runs, csrf }: { runs: DependencyRun[]; csrf: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const latest = runs[0] ?? null;
  const summary = latest && !("error" in latest.summary) ? latest.summary : null;
  const failure = latest && "error" in latest.summary ? latest.summary.error : null;
  const advisories = latest?.advisories ?? [];

  async function scan() {
    setPending(true);
    const res = await apiPost<{ summary: Record<string, number>; detail?: string }>("/api/admin/security/dependencies/scan", {}, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Scan finished", body: `${res.data.summary.advisories} advisor${res.data.summary.advisories === 1 ? "y" : "ies"} across ${res.data.summary.packages} packages.` });
      router.refresh();
      return;
    }
    const raw = res.data as { detail?: string };
    toast({ kind: "error", title: "Scan failed", body: raw.detail ?? describeError(res.status, res.data.error) });
    router.refresh();
  }

  return (
    <>
      <Card
        title="Latest scan"
        description={latest ? `Run ${fmt(latest.runAt)}.` : "No scan has run yet. The cron runs one daily."}
        actions={<Button size="sm" onClick={scan} disabled={pending}>{pending ? "Scanning" : "Scan now"}</Button>}
      >
        {failure && <Alert kind="error">The last scan could not complete: {failure}</Alert>}
        {summary && (
          <>
            <div className="adm-seo-flags" style={{ marginBlockStart: 12 }}>
              {SEVERITIES.map((s) => (
                <Badge key={s} tone={summary[s] > 0 ? TONE[s] : "muted"}>{summary[s]} {s}</Badge>
              ))}
            </div>
            <p className="adm-help">{summary.packages} installed packages checked. {summary.advisories === 0 ? "No known advisories." : `${summary.advisories} advisor${summary.advisories === 1 ? "y" : "ies"} in total.`}</p>
          </>
        )}
      </Card>

      {advisories.length > 0 && (
        <div style={{ marginBlockStart: 18 }}>
          <TableFrame>
            <div className="adm-table-wrap" tabIndex={0}>
              <table className="adm-table">
                <caption className="adm-sr">Known advisories in the installed dependencies</caption>
                <thead>
                  <tr>
                    <th scope="col">Package</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Advisory</th>
                    <th scope="col">Affected</th>
                  </tr>
                </thead>
                <tbody>
                  {advisories.map((a, i) => (
                    <tr key={`${a.package}-${i}`}>
                      <td data-label="Package">
                        <span className="adm-mono">{a.package}</span>
                        <div className="adm-muted" style={{ fontSize: 13 }}>installed {a.installed.join(", ")}{a.dev ? ", build and test only" : ", ships to production"}</div>
                      </td>
                      <td data-label="Severity"><Badge tone={TONE[a.severity]}>{a.severity}</Badge></td>
                      <td data-label="Advisory"><a className="adm-link" href={a.url} target="_blank" rel="noreferrer">{a.title}</a></td>
                      <td data-label="Affected"><span className="adm-mono adm-finding-detail">{a.vulnerableVersions}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>
        </div>
      )}

      {runs.length > 1 && (
        <Card title="Earlier scans" description="So a new advisory is visible as a change, not just a number.">
          <dl className="adm-dl">
            {runs.slice(1).map((r) => (
              <div key={r.id} style={{ display: "contents" }}>
                <dt>{fmt(r.runAt)}</dt>
                <dd>{"error" in r.summary ? `failed: ${r.summary.error}` : `${r.summary.advisories} advisories, ${r.summary.critical} critical, ${r.summary.high} high, ${r.summary.moderate} moderate, ${r.summary.low} low`}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </>
  );
}
