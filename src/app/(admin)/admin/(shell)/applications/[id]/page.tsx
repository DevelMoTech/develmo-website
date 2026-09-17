import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationControls } from "@/app/(admin)/_components/jobs/ApplicationDetail";
import { STAGE_TONE, Stars } from "@/app/(admin)/_components/jobs/ApplicationsList";
import { Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { staffOptions } from "@/app/(admin)/_lib/applications-query";
import { loadApplication } from "@/lib/admin/applications";
import { getTemplate } from "@/lib/admin/templates";
import { markReadForApplication } from "@/lib/admin/submissions";
import { getClientIpHash, getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Application" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function when(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allows } = await requirePageUser(`/admin/applications/${id}`, { permission: "submissions:read" });
  if (!UUID.test(id)) notFound();
  const loaded = await loadApplication(id);
  if (!loaded) notFound();
  const { app, job, notes, events } = loaded;
  const [csrf, staff, rejectionTemplate] = await Promise.all([getCsrfToken(), staffOptions(), getTemplate("application_rejection")]);
  const canWrite = allows("submissions:write");
  const canDelete = allows("users:manage");
  // The inbox mirror of this application is read once the pipeline opens it.
  if (canWrite) await markReadForApplication(id, { user, ipHash: await getClientIpHash() });
  const assignee = staff.find((s) => s.id === app.assigneeId)?.name ?? null;

  return (
    <>
      <PageHeader
        kicker="Applications"
        title={app.name}
        description={
          <>
            <Badge tone={STAGE_TONE[app.stage]}>{app.stage}</Badge>{" "}
            applied for <Link href={`/admin/jobs/${job.id}/applications`} className="adm-link">{job.title}</Link> on {when(app.createdAt)}
            {assignee ? `, assigned to ${assignee}` : ""}
          </>
        }
        actions={<ButtonLink href="/admin/applications">All applications</ButtonLink>}
      />
      <div className="adm-split">
        <div className="adm-stack">
          <Card title="Applicant">
            <dl className="adm-dl">
              <dt>Email</dt>
              <dd><a className="adm-link" href={`mailto:${encodeURIComponent(app.email)}`}>{app.email}</a></dd>
              <dt>Phone</dt>
              <dd>{app.phone || <span className="adm-muted">not given</span>}</dd>
              <dt>Location</dt>
              <dd>{app.location || <span className="adm-muted">not given</span>}</dd>
              <dt>LinkedIn</dt>
              <dd>{app.linkedinUrl ? <a className="adm-link" href={app.linkedinUrl} target="_blank" rel="noreferrer noopener">{app.linkedinUrl}</a> : <span className="adm-muted">not given</span>}</dd>
              <dt>Portfolio</dt>
              <dd>{app.portfolioUrl ? <a className="adm-link" href={app.portfolioUrl} target="_blank" rel="noreferrer noopener">{app.portfolioUrl}</a> : <span className="adm-muted">not given</span>}</dd>
              <dt>Rating</dt>
              <dd><Stars rating={app.rating} /></dd>
              <dt>Language</dt>
              <dd>{app.locale}</dd>
              <dt>Consent</dt>
              <dd>{app.consentAt ? when(app.consentAt) : <span className="adm-muted">not recorded</span>}</dd>
              <dt>Acknowledgement</dt>
              <dd>{app.ackSentAt ? `Sent ${when(app.ackSentAt)}` : app.ackError ? <span className="adm-error">Not sent: {app.ackError}</span> : <span className="adm-muted">pending</span>}</dd>
            </dl>
          </Card>
          <Card title="Cover note">
            {app.coverNote ? <p style={{ whiteSpace: "pre-wrap" }}>{app.coverNote}</p> : <p className="adm-empty">No cover note.</p>}
          </Card>
          <Card title={`Notes (${notes.length})`}>
            {notes.length === 0 ? (
              <p className="adm-empty">No internal notes yet.</p>
            ) : (
              <ul className="adm-feed">
                {notes.map((n) => (
                  <li key={n.id}>
                    <span style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>
                    <time dateTime={n.createdAt.toISOString()}>{when(n.createdAt)}</time>
                    <span className="adm-feed-who">{n.authorName ?? "Removed user"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Stage history">
            <ul className="adm-feed">
              {events.map((e) => (
                <li key={e.id}>
                  <span>
                    {e.fromStage ? `${e.fromStage} to ${e.toStage}` : `Entered ${e.toStage}`}
                    {e.note ? `: ${e.note}` : ""}
                  </span>
                  <time dateTime={e.createdAt.toISOString()}>{when(e.createdAt)}</time>
                  <span className="adm-feed-who">{e.actorName ?? "Applicant"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <ApplicationControls
          csrf={csrf}
          app={{ id: app.id, name: app.name, email: app.email, stage: app.stage, rating: app.rating, assigneeId: app.assigneeId, cvFilename: app.cvFilename, cvSize: app.cvSize, rejectionSentAt: app.rejectionSentAt?.toISOString() ?? null, jobTitle: job.title }}
          staff={staff}
          canWrite={canWrite}
          canDelete={canDelete}
          rejectionTemplate={rejectionTemplate}
        />
      </div>
    </>
  );
}
