import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmissionControls } from "@/app/(admin)/_components/submissions/SubmissionControls";
import { DeliveryBadge, STATUS_LABEL, STATUS_TONE } from "@/app/(admin)/_components/submissions/SubmissionsList";
import { Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { getSetting } from "@/lib/admin/settings";
import { loadSubmission, markRead, staffOptions } from "@/lib/admin/submissions";
import { getClientIpHash, getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { mailtoFor, renderReply } from "@/lib/submissions/reply";

export const metadata: Metadata = { title: "Submission" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function when(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "";
}

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePageUser(`/admin/submissions/${id}`, { permission: "submissions:read" });
  if (!UUID.test(id)) notFound();
  const canWrite = can(user.role, "submissions:write");
  // Opening a new enquiry marks it read, for staff who can act on it.
  if (canWrite) await markRead(id, { user, ipHash: await getClientIpHash() });
  const loaded = await loadSubmission(id);
  if (!loaded) notFound();
  const { row, notes, application } = loaded;
  const [csrf, staff, template] = await Promise.all([getCsrfToken(), staffOptions(), getSetting("reply_template")]);
  const reply = renderReply(template, row);
  const utm = (row.utm ?? {}) as Record<string, string>;
  const qualifiers = [
    ["Service", row.service],
    ["Product", row.product],
    ["Industry", row.industry],
    ["Intent", row.intent],
    ["Budget", row.budget],
    ["Source", row.source],
    ["Topic", row.topic],
    ["Region", row.region],
  ].filter(([, v]) => v);

  return (
    <>
      <PageHeader
        kicker="Inbox"
        title={row.name || row.email || "Submission"}
        description={
          <>
            <Badge tone="muted">{row.kind}</Badge> {row.isSpam ? <Badge tone="danger">spam: {row.spamReason ?? "manual"}</Badge> : <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>}{" "}
            received {when(row.createdAt)}
            {row.assigneeId ? `, assigned to ${staff.find((s) => s.id === row.assigneeId)?.name ?? "a removed user"}` : ""}
          </>
        }
        actions={<ButtonLink href={row.isSpam ? "/admin/submissions/spam" : "/admin/submissions"}>{row.isSpam ? "Back to spam" : "Back to the inbox"}</ButtonLink>}
      />
      <div className="adm-split">
        <div className="adm-stack">
          <Card title="Message">
            {row.message ? <p className="adm-message">{row.message}</p> : <p className="adm-empty">No message.</p>}
            {application && (
              <p style={{ marginBlockStart: 12 }}>
                This is a job application. <Link className="adm-link" href={`/admin/applications/${application.id}`}>Open it in the pipeline</Link> (stage: {application.stage}).
              </p>
            )}
          </Card>
          <Card title="Contact">
            <dl className="adm-dl">
              <dt>Email</dt>
              <dd>{row.email ? <a className="adm-link" href={`mailto:${encodeURIComponent(row.email)}`}>{row.email}</a> : <span className="adm-muted">not given</span>}</dd>
              <dt>Phone</dt>
              <dd>{row.phone || <span className="adm-muted">not given</span>}</dd>
              <dt>Company</dt>
              <dd>{row.company || <span className="adm-muted">not given</span>}</dd>
              <dt>Tags</dt>
              <dd>{row.tags.length ? row.tags.join(", ") : <span className="adm-muted">none</span>}</dd>
            </dl>
          </Card>
          <Card title="Qualifiers" description="What the visitor was looking at when they wrote, from the form's URL parameters.">
            {qualifiers.length === 0 ? (
              <p className="adm-empty">No qualifiers were captured.</p>
            ) : (
              <dl className="adm-dl">
                {qualifiers.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          <Card title="Context">
            <dl className="adm-dl">
              <dt>Landing page</dt>
              <dd>{row.landingPage || <span className="adm-muted">unknown</span>}</dd>
              <dt>Referrer</dt>
              <dd>{row.referrer || <span className="adm-muted">none or same site</span>}</dd>
              <dt>UTM</dt>
              <dd>{Object.keys(utm).length ? Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(", ") : <span className="adm-muted">none</span>}</dd>
              <dt>Language</dt>
              <dd>{row.locale ?? "en"}</dd>
              <dt>User agent</dt>
              <dd className="adm-mono" style={{ fontSize: 12.5 }}>{row.userAgent || <span className="adm-muted">unknown</span>}</dd>
              <dt>IP</dt>
              <dd>{row.ipHash ? <span className="adm-mono">hash {row.ipHash.slice(0, 12)}, stored for abuse prevention</span> : <span className="adm-muted">not recorded</span>}</dd>
            </dl>
          </Card>
          <Card title="Delivery" description={row.kind === "contact" ? "The email chain runs after the enquiry is stored, so a failure here never loses it." : "Applications are acknowledged from the pipeline; there is no inbox email to deliver."}>
            <dl className="adm-dl">
              <dt>Status</dt>
              <dd><DeliveryBadge status={row.deliveryStatus} channel={row.deliveryChannel} kind={row.kind} /></dd>
              <dt>Attempts</dt>
              <dd>{row.deliveryAttempts}{row.lastDeliveryAt ? `, last ${when(row.lastDeliveryAt)}` : ""}</dd>
              {row.deliveredAt && (
                <>
                  <dt>Delivered</dt>
                  <dd>{when(row.deliveredAt)}</dd>
                </>
              )}
              {row.deliveryError && (
                <>
                  <dt>Detail</dt>
                  <dd className={row.deliveryStatus === "failed" ? "adm-error" : undefined} style={{ whiteSpace: "pre-wrap" }}>{row.deliveryError}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
        <SubmissionControls
          csrf={csrf}
          item={{
            id: row.id,
            kind: row.kind,
            status: row.status,
            isSpam: row.isSpam,
            name: row.name,
            email: row.email,
            assigneeId: row.assigneeId,
            tags: row.tags,
            deliveryStatus: row.deliveryStatus,
            deliveryChannel: row.deliveryChannel,
            deliveryError: row.deliveryError,
            deliveryAttempts: row.deliveryAttempts,
            lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
            mailto: mailtoFor(row.email, reply),
          }}
          notes={notes}
          staff={staff}
          canWrite={canWrite}
          canDelete={can(user.role, "users:manage")}
        />
      </div>
    </>
  );
}
