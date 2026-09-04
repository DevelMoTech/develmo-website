"use client";

import { useState } from "react";
import type { HeaderReport } from "@/lib/security/headers-grade";
import { INTERESTING_HEADERS } from "@/lib/security/headers-grade";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";

const PATHS = ["/", "/what-we-do", "/contact-develmo", "/our-blogs", "/robots.txt", "/sitemap.xml"];

const TONE = { pass: "ok", warn: "warn", fail: "danger" } as const;

export type InitialCheck = { ok: true; report: HeaderReport; headers: Record<string, string> } | { ok: false; error: string };

// The first check runs on the server so the panel is populated on arrival;
// every later check is this button.
export function HeadersViewer({ csrf, initial }: { csrf: string; initial: InitialCheck }) {
  const [path, setPath] = useState("/");
  const [report, setReport] = useState<HeaderReport | null>(initial.ok ? initial.report : null);
  const [all, setAll] = useState<Record<string, string> | null>(initial.ok ? initial.headers : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initial.ok ? null : initial.error);

  async function check(target: string) {
    setPending(true);
    setError(null);
    const res = await apiPost<{ report: HeaderReport; headers: Record<string, string> }>("/api/admin/security/headers", { path: target }, csrf);
    setPending(false);
    if (res.data.ok) {
      setReport(res.data.report);
      setAll(res.data.headers);
    } else {
      const raw = res.data as { detail?: string };
      setError(raw.detail ?? describeError(res.status, res.data.error));
      setReport(null);
      setAll(null);
    }
  }

  const shown = all ? INTERESTING_HEADERS.filter((h) => all[h] !== undefined).map((h) => [h, all[h]] as const) : [];

  return (
    <>
      <Card
        title="Check a public URL"
        description="Fetches the page from this deployment and reads the headers back."
        actions={
          <>
            <label className="adm-sr" htmlFor="hdr-path">Path</label>
            <select id="hdr-path" className="adm-input adm-select" value={path} onChange={(e) => setPath(e.target.value)} disabled={pending} style={{ maxInlineSize: 220 }}>
              {PATHS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => check(path)} disabled={pending}>{pending ? "Checking" : "Check"}</Button>
          </>
        }
      >
        {error && <Alert kind="error">{error}</Alert>}
        {report && (
          <p className="adm-lead" style={{ margin: "12px 0 0" }}>
            Grade <strong>{report.grade}</strong> for {report.url}, which answered {report.status}.
          </p>
        )}
      </Card>

      {report && (
        <div style={{ marginBlockStart: 18 }}>
          <TableFrame>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="adm-sr">Graded security headers</caption>
                <thead>
                  <tr>
                    <th scope="col">Header</th>
                    <th scope="col">Result</th>
                    <th scope="col">What was sent</th>
                    <th scope="col">Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {report.checks.map((c) => (
                    <tr key={c.header}>
                      <td data-label="Header"><span className="adm-mono">{c.header}</span></td>
                      <td data-label="Result"><Badge tone={TONE[c.status]}>{c.status}</Badge></td>
                      <td data-label="What was sent">{c.value ? <span className="adm-mono adm-finding-detail">{c.value}</span> : <span className="adm-muted">not sent</span>}</td>
                      <td data-label="Assessment">
                        <div>{c.detail}</div>
                        {c.status !== "pass" && <div className="adm-muted" style={{ fontSize: 13 }}>Looks for: {c.expected}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>
        </div>
      )}

      {report && report.disclosures.length > 0 && (
        <Card title="Information disclosure" description="Headers that name the software behind the site.">
          <dl className="adm-dl">
            {report.disclosures.map((d) => (
              <div key={d.header} style={{ display: "contents" }}>
                <dt><span className="adm-mono">{d.header}</span></dt>
                <dd><span className="adm-mono">{d.value}</span></dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {shown.length > 0 && (
        <Card title="Full response" description="Every header of interest, as received.">
          <pre className="adm-pre" aria-label="Response headers">{shown.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
        </Card>
      )}
    </>
  );
}
