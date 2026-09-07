import type { Metadata } from "next";
import { RedirectsManager } from "@/app/(admin)/_components/seo/RedirectsManager";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listRedirects } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { STATIC_REDIRECTS } from "@/lib/seo/static-redirects";
import { REDIRECT_TTL_MS } from "@/lib/seo/redirect-map";

export const metadata: Metadata = { title: "Redirects" };

// Redirects manager (brief §3.6). Database rules are served by the proxy
// from an in-memory map; the static next.config.ts rules run first.
export default async function RedirectsPage() {
  const { user } = await requirePageUser("/admin/seo/redirects", { permission: "seo:read" });
  const [csrf, rows] = await Promise.all([getCsrfToken(), listRedirects()]);
  return (
    <>
      <PageHeader kicker="SEO" title="Redirects" description={`Served by the proxy from memory and refreshed at most every ${REDIRECT_TTL_MS / 1000} seconds, so a rule is live everywhere within that window and no visitor request waits on the database.`} />
      <SeoNav />
      <RedirectsManager rows={rows} csrf={csrf} canWrite={can(user.role, "seo:write")} />
      <Card title="Static redirects" description="Deployed with the code in next.config.ts. They run before the proxy, so a database rule cannot use one of these sources." className="adm-card">
        <div className="adm-table-wrap" tabIndex={0}>
          <table className="adm-table adm-table-plain">
            <caption className="adm-sr">Static redirects from next.config.ts</caption>
            <thead>
              <tr><th scope="col">Source</th><th scope="col">Destination</th><th scope="col">Code</th></tr>
            </thead>
            <tbody>
              {STATIC_REDIRECTS.map((r) => (
                <tr key={r.source}>
                  <td data-label="Source" className="adm-seo-path">{r.source}</td>
                  <td data-label="Destination" className="adm-seo-path">{r.destination}</td>
                  <td data-label="Code">{r.permanent ? 308 : 307}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
