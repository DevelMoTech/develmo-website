import type { Metadata } from "next";
import Link from "next/link";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { Card, CardLink, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { securityOverview, SECURITY_PERMISSION } from "@/lib/admin/security";
import { requirePageUser } from "@/lib/auth/current";
import { SEVERITIES } from "@/lib/security/deps-types";

export const metadata: Metadata = { title: "Security" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

export default async function SecurityPage() {
  await requirePageUser("/admin/security", { permission: SECURITY_PERMISSION });
  const s = await securityOverview();
  const scan = s.lastScan;
  const summary = scan && !("error" in scan.summary) ? scan.summary : null;
  const scanError = scan && "error" in scan.summary ? scan.summary.error : null;
  const worst = summary ? SEVERITIES.find((sev) => summary[sev] > 0) ?? null : null;

  const tiles = [
    { label: "Events, 24 hours", value: s.events24h, hint: `${s.failedLogins24h} failed logins, ${s.rateLimited24h} rate limit trips`, href: "/admin/security/events" },
    { label: "Blocked addresses", value: s.blockedIps, hint: `${s.allowedIps} allow rule${s.allowedIps === 1 ? "" : "s"} in force`, href: "/admin/security/access" },
    { label: "Active sessions", value: s.activeSessions, hint: s.lockedUsers > 0 ? `${s.lockedUsers} locked account${s.lockedUsers === 1 ? "" : "s"}` : "No locked accounts", href: "/admin/security/sessions" },
    {
      label: "Dependency advisories",
      value: summary ? summary.advisories : scanError ? "scan failed" : "not scanned",
      hint: scan ? `Last scan ${fmt(scan.runAt)}${worst ? `, worst severity ${worst}` : ""}` : "The cron scans daily",
      href: "/admin/security/dependencies",
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Site"
        title="Security"
        description="Authentication and abuse events, IP access control, runtime rate limits, live response headers, session oversight and dependency status. Owner and Admin only."
      />
      <SecurityNav />
      <div className="adm-grid adm-grid-tight" style={{ marginBlockStart: 18 }}>
        {tiles.map((t) => (
          <CardLink key={t.label} href={t.href}>
            <div className="adm-tile">
              <div className="adm-tile-top">{t.label}</div>
              <div className="adm-tile-value">{t.value}</div>
              <div className="adm-tile-sub">{t.hint}</div>
            </div>
          </CardLink>
        ))}
      </div>
      <Card title="What is enforced where" description="So the next person knows which control lives in which layer.">
        <dl className="adm-dl">
          <dt>IP access rules</dt>
          <dd>The proxy, before any route runs. A blocked address gets 403 on the whole site. The rule set is held in memory and refreshed every five seconds, so no visitor request queries the database.</dd>
          <dt>Rate limits</dt>
          <dd>The route handlers, through a durable counter. Limits are read from the database with a 30 second cache, so a change takes effect without a restart.</dd>
          <dt>Response headers</dt>
          <dd>Deployed with the code in next.config.ts. The <Link className="adm-link" href="/admin/security/headers">headers panel</Link> reads them back and grades them; it never changes them.</dd>
          <dt>Second factor</dt>
          <dd>
            The sign-in flow, by the policy under <Link className="adm-link" href="/admin/security/authentication">Authentication</Link>: off, optional (the default), required for Owner and Admin, or required for everyone. A change applies to the next sign in at once.
          </dd>
          <dt>Roles</dt>
          <dd>Every page and endpoint in this module requires security:write, which only Owner and Admin hold. Editor and Viewer are refused server side.</dd>
        </dl>
      </Card>
    </>
  );
}
