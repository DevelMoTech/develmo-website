import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, CardLink, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { Icon, type IconName } from "@/app/(admin)/_components/ui/Icon";
import {
  healthStats,
  jobStats,
  postStats,
  recentActivity,
  relativeTime,
  securityStats,
  submissionStats,
  vitalsStats,
} from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Dashboard" };

const DENIED: Record<string, string> = {
  "users:read": "You do not have access to user management.",
  "audit:read": "You do not have access to the audit log.",
  "security:read": "You do not have access to the security manager.",
  "settings:read": "You do not have access to settings.",
  "performance:read": "You do not have access to the performance manager.",
};

// Inline SVG sparkline (brief §2: hand rolled, no chart library).
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 160;
  const h = 40;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v / max) * (h - 8)).toFixed(1)}`);
  return (
    <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(h - 4 - (v / max) * (h - 8)).toFixed(1)} r={2.2} fill="currentColor" />
      ))}
    </svg>
  );
}

function Tile({ href, icon, label, value, sub, children }: { href: string; icon: IconName; label: string; value: string | number; sub?: string; children?: React.ReactNode }) {
  return (
    <CardLink href={href}>
      <div className="adm-tile">
        <div className="adm-tile-top"><Icon name={icon} size={18} />{label}</div>
        <div className="adm-tile-value">{value}</div>
        {sub && <div className="adm-tile-sub">{sub}</div>}
        {children}
      </div>
    </CardLink>
  );
}

function fmtMs(v: number | null): string {
  return v === null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { user, allows: allowed } = await requirePageUser("/admin");
  const sp = await searchParams;

  const [subs, postsS, jobsS, vitals, security, health, activity] = await Promise.all([
    allowed("submissions:read") ? submissionStats() : null,
    allowed("content:read") ? postStats() : null,
    allowed("content:read") ? jobStats() : null,
    allowed("performance:read") ? vitalsStats() : null,
    allowed("security:read") ? securityStats() : null,
    healthStats(),
    allowed("audit:read") ? recentActivity(8) : null,
  ]);
  const denied = sp.denied ? (DENIED[sp.denied] ?? "You do not have permission to open that page.") : null;
  const now = new Date();

  return (
    <>
      <PageHeader kicker="DevelMo console" title={`Welcome, ${user.name}`} description="What needs attention across the site, with live numbers from the database." />
      {denied && <Alert kind="warn">{denied}</Alert>}

      <div className="adm-grid adm-grid-tight" style={{ marginBlockStart: denied ? 18 : 0 }}>
        {subs && (
          <Tile href="/admin/submissions" icon="inbox" label="New submissions" value={subs.unread} sub={`${subs.total} total, ${subs.spam} in spam`}>
            <Sparkline values={subs.spark} label={`Submissions per day over the last 7 days: ${subs.spark.join(", ")}`} />
          </Tile>
        )}
        {postsS && (
          <Tile href="/admin/posts" icon="posts" label="Posts" value={postsS.published} sub="published">
            <div className="adm-tile-row"><span><b>{postsS.drafts}</b> drafts</span><span><b>{postsS.scheduled}</b> scheduled</span><span><b>{postsS.archived}</b> archived</span></div>
          </Tile>
        )}
        {jobsS && (
          <Tile href="/admin/jobs" icon="jobs" label="Open roles" value={jobsS.open} sub={`${jobsS.total} jobs in total`}>
            <div className="adm-tile-row"><span><b>{jobsS.newApplications}</b> new applications</span><span><b>{jobsS.applications}</b> total</span></div>
          </Tile>
        )}
        {vitals && (
          <Tile href="/admin/performance" icon="gauge" label="Core Web Vitals, 7 days" value={vitals.samples === 0 ? "No data" : fmtMs(vitals.lcp)} sub={vitals.samples === 0 ? "No field samples recorded yet" : `LCP p75 from ${vitals.samples} samples`}>
            {vitals.samples > 0 && (
              <div className="adm-tile-row"><span>INP <b>{fmtMs(vitals.inp)}</b></span><span>CLS <b>{vitals.cls === null ? "n/a" : vitals.cls.toFixed(3)}</b></span></div>
            )}
          </Tile>
        )}
        {security && (
          <Tile href="/admin/security" icon="shield" label="Security, 24 hours" value={security.total} sub="events recorded">
            <div className="adm-tile-row"><span><b>{security.failedLogins}</b> failed logins</span><span><b>{security.rateLimited}</b> rate limit trips</span><span><b>{security.blockedIps}</b> blocked IPs</span></div>
          </Tile>
        )}
      </div>

      <div className="adm-stack" style={{ marginBlockStart: 18 }}>
        <Card title="Site health" description="Live checks from this server.">
          <ul className="adm-health">
            <li><span className={`adm-dot ${health.db.ok ? "adm-dot-ok" : "adm-dot-bad"}`} aria-hidden="true" />Database: {health.db.detail}</li>
            <li><span className={`adm-dot ${health.email?.ok ? "adm-dot-ok" : health.email?.ok === null ? "adm-dot-warn" : "adm-dot-bad"}`} aria-hidden="true" />Email: {health.email?.detail ?? "Unknown"}</li>
            <li><span className={`adm-dot ${health.lastPublish ? "adm-dot-ok" : "adm-dot-warn"}`} aria-hidden="true" />Last publish: {health.lastPublish ? relativeTime(health.lastPublish, now) : "none yet"}</li>
            <li><span className="adm-dot adm-dot-ok" aria-hidden="true" />Data cache: 5 minute TTL, tag revalidation on publish{health.lastRevalidate ? `, last manual revalidation ${relativeTime(health.lastRevalidate, now)}` : ""}</li>
            <li><span className="adm-dot adm-dot-ok" aria-hidden="true" />Sitemap: generated on request from the database, 5 minute cache</li>
          </ul>
        </Card>

        {activity && (
          <Card title="Recent activity" description="Latest entries in the append-only audit log." actions={<Link className="adm-link" href="/admin/audit">Open audit log</Link>}>
            {activity.length === 0 ? (
              <p>No changes recorded yet.</p>
            ) : (
              <ul className="adm-feed">
                {activity.map((a) => (
                  <li key={a.id}>
                    <span><span className="adm-mono">{a.action}</span> on {a.entityType}{a.entityId ? ` ${a.entityId.slice(0, 8)}` : ""}</span>
                    <time dateTime={a.createdAt.toISOString()}>{relativeTime(a.createdAt, now)}</time>
                    <span className="adm-feed-who">{a.actorEmail ?? "system"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
