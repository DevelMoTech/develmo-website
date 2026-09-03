import type { Metadata } from "next";
import { LocaleNote, SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { Card, CardLink, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { getSitemapState, listAudits, listRedirects } from "@/lib/admin/seo";
import { requirePageUser } from "@/lib/auth/current";
import { FINDING_LABELS, type FindingKind } from "@/lib/seo/audit";
import { STATIC_REDIRECTS } from "@/lib/seo/static-redirects";

export const metadata: Metadata = { title: "SEO" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

// The SEO manager's landing page (brief §3.6): live counts and the way in
// to each tool.
export default async function SeoPage() {
  await requirePageUser("/admin/seo", { permission: "seo:read" });
  const [c, redirects, sitemap, audits] = await Promise.all([moduleCounts(), listRedirects(), getSitemapState(), listAudits(1)]);
  const last = audits[0] ?? null;
  const enabled = redirects.filter((r) => r.enabled).length;
  const topKinds = last?.summary
    ? (Object.entries(last.summary) as [string, number][])
        .filter(([k, v]) => k in FINDING_LABELS && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const tiles = [
    { label: "Metadata overrides", value: c.seoOverrides, hint: "Routes with a title, description, canonical, image or robots override", href: "/admin/seo/pages" },
    { label: "Database redirects", value: `${enabled} live`, hint: `${redirects.length - enabled} disabled, plus ${STATIC_REDIRECTS.length} static in next.config.ts`, href: "/admin/seo/redirects" },
    { label: "Sitemap URLs", value: sitemap.urls, hint: `Last generated ${fmt(sitemap.generatedAt)}`, href: "/admin/seo/sitemap" },
    { label: "Last audit", value: last ? (last.status === "finished" ? `${last.summary?.findings ?? 0} findings` : last.status) : "none yet", hint: last ? `${fmt(last.startedAt)}, ${last.routesScanned ?? 0} pages` : "Run one from the Audit tab", href: "/admin/seo/audit" },
  ];
  return (
    <>
      <PageHeader kicker="Site" title="SEO" description="Per route metadata, redirects, the sitemap, robots.txt, structured data and an on demand audit. Everything here is live on the next request, without a rebuild." />
      <SeoNav />
      <LocaleNote />
      <div className="adm-grid adm-grid-tight" style={{ marginBlockStart: 18 }}>
        {tiles.map((s) => (
          <CardLink key={s.label} href={s.href}>
            <div className="adm-tile">
              <div className="adm-tile-top">{s.label}</div>
              <div className="adm-tile-value">{s.value}</div>
              <div className="adm-tile-sub">{s.hint}</div>
            </div>
          </CardLink>
        ))}
      </div>
      {last && last.status === "finished" && topKinds.length > 0 && (
        <Card title="Where the last audit found the most" description="Counts by finding type. Open the Audit tab for the pages behind each.">
          <dl className="adm-dl">
            {topKinds.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{FINDING_LABELS[k as FindingKind]}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </>
  );
}
