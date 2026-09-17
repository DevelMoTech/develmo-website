import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditRunner } from "@/app/(admin)/_components/seo/AuditRunner";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { TableFrame } from "@/app/(admin)/_components/ui/TableFrame";
import { compareFindings, loadAudit, loadFindings, previousAudit, type FindingRow } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { FINDING_KINDS, FINDING_LABELS, type FindingKind } from "@/lib/seo/audit";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Audit run" };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function detailText(f: FindingRow): string {
  const d = f.detail;
  switch (f.kind) {
    case "duplicate_title":
      return `"${String(d.title ?? "")}" is also the title of ${(d.sharedWith as string[] | undefined)?.join(", ") ?? "another page"}`;
    case "overlength_description":
      return `${d.length} characters (practical limit ${d.limit})`;
    case "missing_alt":
      return `${d.count} image${d.count === 1 ? "" : "s"}: ${((d.images as string[] | undefined) ?? []).join(", ")}`;
    case "broken_link":
      return `links to ${String(d.target ?? "")} which answered ${d.status === 0 ? "nothing" : String(d.status)}`;
    case "h1_count":
      return d.count === 0 ? "no H1" : `${d.count} H1s: ${((d.h1s as string[] | undefined) ?? []).join(" | ")}`;
    case "fetch_error":
      return `status ${String(d.status ?? 0)}${d.error ? `, ${String(d.error)}` : ""}`;
    case "redirected":
      return `answered ${String(d.status ?? "")}${d.location ? ` to ${String(d.location)}` : ""}; the target was not crawled`;
    case "canonical_mismatch":
      return `canonical is ${String(d.canonical ?? "")}, which is ${String(d.target ?? "")}, not this page`;
    case "orphan_page":
      return "no crawled page links to it";
    default:
      return "";
  }
}

export default async function AuditRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { allows } = await requirePageUser(`/admin/seo/audit/${id}`, { permission: "seo:read" });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await loadAudit(id);
  if (!run) notFound();
  const sp = await searchParams;
  const kindFilter = typeof sp.kind === "string" && (FINDING_KINDS as readonly string[]).includes(sp.kind) ? (sp.kind as FindingKind) : null;
  const view = sp.view === "changes" ? "changes" : "all";
  const [csrf, findings, prev] = await Promise.all([getCsrfToken(), loadFindings(id), previousAudit(run)]);
  const prevFindings = prev ? await loadFindings(prev.id) : [];
  const diff = prev ? compareFindings(findings, prevFindings) : null;
  const shown = (view === "changes" && diff ? diff.added : findings).filter((f) => !kindFilter || f.kind === kindFilter);
  const counts = FINDING_KINDS.map((k) => ({ kind: k, n: findings.filter((f) => f.kind === k).length })).filter((c) => c.n > 0);
  const href = (patch: { kind?: string | null; view?: string }) => {
    const q = new URLSearchParams();
    const k = patch.kind === undefined ? kindFilter : patch.kind;
    const v = patch.view ?? view;
    if (k) q.set("kind", k);
    if (v !== "all") q.set("view", v);
    const s = q.toString();
    return `/admin/seo/audit/${id}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        kicker="SEO audit"
        title={`Run of ${fmt(run.startedAt)}`}
        description={run.status === "finished" ? `${run.routesScanned} pages crawled at ${run.origin}, ${findings.length} findings in ${Math.round((run.summary?.durationMs ?? 0) / 1000)} seconds.${run.summary?.truncated ? " The crawl hit its four minute limit before every page was visited." : ""}` : run.status === "failed" ? `Failed: ${run.error ?? "unknown error"}` : "Still crawling."}
        actions={<Link className="adm-btn adm-btn-ghost adm-btn-sm" href="/admin/seo/audit">All runs</Link>}
      />
      <SeoNav />
      {run.status === "running" && <AuditRunner csrf={csrf} canWrite={allows("seo:write")} running={run} />}
      {run.status === "finished" && (
        <>
          <Card
            title={prev ? `Compared with ${fmt(prev.startedAt)}` : "First run"}
            description={diff ? `${diff.added.length} new, ${diff.fixed.length} fixed, ${diff.unchanged} unchanged.` : "There is no earlier finished run to compare with."}
            actions={
              diff ? (
                <>
                  <Link className={`adm-btn adm-btn-sm ${view === "all" ? "adm-btn-primary" : "adm-btn-ghost"}`} href={href({ view: "all" })} aria-current={view === "all" ? "page" : undefined}>All findings</Link>
                  <Link className={`adm-btn adm-btn-sm ${view === "changes" ? "adm-btn-primary" : "adm-btn-ghost"}`} href={href({ view: "changes" })} aria-current={view === "changes" ? "page" : undefined}>New since previous</Link>
                </>
              ) : undefined
            }
          >
            {diff && diff.fixed.length > 0 && (
              <details className="adm-details">
                <summary>{diff.fixed.length} fixed since the previous run</summary>
                <ul>
                  {diff.fixed.map((f) => <li key={f.id}><span className="adm-seo-path">{f.path}</span> {FINDING_LABELS[f.kind]}</li>)}
                </ul>
              </details>
            )}
          </Card>
          <div className="adm-chips" role="navigation" aria-label="Filter by finding type" style={{ marginBlock: 14 }}>
            <Link className={`adm-btn adm-btn-sm ${kindFilter === null ? "adm-btn-primary" : "adm-btn-ghost"}`} href={href({ kind: null })}>All ({findings.length})</Link>
            {counts.map((c) => (
              <Link key={c.kind} className={`adm-btn adm-btn-sm ${kindFilter === c.kind ? "adm-btn-primary" : "adm-btn-ghost"}`} href={href({ kind: c.kind })}>{FINDING_LABELS[c.kind]} ({c.n})</Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <Card title="Nothing to show" description={findings.length === 0 ? "The crawl found no issues." : "No findings match this filter."} />
          ) : (
            <TableFrame>
              <div className="adm-table-wrap" tabIndex={0}>
                <table className="adm-table">
                  <caption className="adm-sr">Audit findings</caption>
                  <thead>
                    <tr><th scope="col">Page</th><th scope="col">Finding</th><th scope="col">Detail</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((f) => (
                      <tr key={f.id}>
                        <td data-label="Page"><a className="adm-link adm-seo-path" href={`${site.url}${f.path === "/" ? "" : f.path}`} target="_blank" rel="noreferrer">{f.path}</a></td>
                        <td data-label="Finding"><Badge tone={f.severity === "error" ? "danger" : f.severity === "warning" ? "warn" : "info"}>{FINDING_LABELS[f.kind]}</Badge></td>
                        <td data-label="Detail" className="adm-finding-detail">{detailText(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableFrame>
          )}
        </>
      )}
    </>
  );
}
