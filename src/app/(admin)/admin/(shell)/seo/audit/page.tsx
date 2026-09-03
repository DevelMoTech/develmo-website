import type { Metadata } from "next";
import Link from "next/link";
import { AuditRunner } from "@/app/(admin)/_components/seo/AuditRunner";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { TableFrame } from "@/app/(admin)/_components/ui/TableFrame";
import { listAudits } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { FINDING_KINDS, FINDING_LABELS } from "@/lib/seo/audit";

export const metadata: Metadata = { title: "SEO audit" };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null || now === before) return <span>{now}</span>;
  const diff = now - before;
  return (
    <span>
      {now} <span className={diff > 0 ? "adm-delta-up" : "adm-delta-down"} aria-label={diff > 0 ? `${diff} more than the previous run` : `${-diff} fewer than the previous run`}>({diff > 0 ? `+${diff}` : diff})</span>
    </span>
  );
}

// Audit runs (brief §3.6): each crawl is stored so runs can be compared.
export default async function AuditPage() {
  const { user } = await requirePageUser("/admin/seo/audit", { permission: "seo:read" });
  const [csrf, runs] = await Promise.all([getCsrfToken(), listAudits(30)]);
  const running = runs.find((r) => r.status === "running") ?? null;
  const finished = runs.filter((r) => r.status === "finished");
  const columns = FINDING_KINDS.filter((k) => finished.some((r) => (r.summary?.[k] ?? 0) > 0));
  return (
    <>
      <PageHeader kicker="SEO" title="Audit" description="An on demand crawl of the public site: titles, descriptions, alt text, internal links, orphans, canonicals and H1s. Every run is kept, with the change from the run before." />
      <SeoNav />
      <AuditRunner csrf={csrf} canWrite={can(user.role, "seo:write")} running={running} />
      {runs.length === 0 ? (
        <Card title="No runs yet" description="Run the first audit to get a baseline." />
      ) : (
        <TableFrame>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="adm-sr">Audit runs, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Status</th>
                  <th scope="col">Pages</th>
                  <th scope="col">Findings</th>
                  {columns.map((k) => <th key={k} scope="col">{FINDING_LABELS[k]}</th>)}
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => {
                  const prev = finished.find((f) => new Date(f.startedAt) < new Date(r.startedAt)) ?? null;
                  const s = r.summary;
                  return (
                    <tr key={r.id}>
                      <td data-label="Started"><Link className="adm-link" href={`/admin/seo/audit/${r.id}`}>{fmt(r.startedAt)}</Link>{i === 0 && r.status === "finished" && <span className="adm-muted" style={{ marginInlineStart: 8 }}>latest</span>}</td>
                      <td data-label="Status">
                        <Badge tone={r.status === "finished" ? "ok" : r.status === "failed" ? "danger" : "warn"}>{r.status}</Badge>
                        {r.error && <div className="adm-finding-detail">{r.error}</div>}
                      </td>
                      <td data-label="Pages">{r.routesScanned ?? (r.status === "running" ? "crawling" : "0")}</td>
                      <td data-label="Findings">{s ? <Delta now={s.findings} before={prev?.summary?.findings ?? null} /> : "0"}</td>
                      {columns.map((k) => (
                        <td key={k} data-label={FINDING_LABELS[k]}>{s ? <Delta now={s[k] ?? 0} before={prev?.summary ? prev.summary[k] ?? 0 : null} /> : ""}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableFrame>
      )}
    </>
  );
}
