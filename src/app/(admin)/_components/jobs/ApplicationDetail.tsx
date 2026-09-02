"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES } from "@/lib/schemas/job";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Checkbox, Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

export type ApplicationView = {
  id: string;
  name: string;
  email: string;
  stage: (typeof STAGES)[number];
  rating: number | null;
  assigneeId: string | null;
  cvFilename: string | null;
  cvSize: number | null;
  rejectionSentAt: string | null;
  jobTitle: string;
};

const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { new: "New", screening: "Screening", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected" };

// Pipeline controls for one application (brief §3.4): stage with a note,
// star rating, assignment, internal notes, signed CV download, rejection
// email from the editable template, and hard delete for admins.
export function ApplicationControls({
  csrf,
  app,
  staff,
  canWrite,
  canDelete,
  rejectionTemplate,
}: {
  csrf: string;
  app: ApplicationView;
  staff: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
  rejectionTemplate: { subject: string; body: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [stage, setStage] = useState(app.stage);
  const [stageNote, setStageNote] = useState("");
  const [rating, setRating] = useState(app.rating);
  const [assigneeId, setAssigneeId] = useState(app.assigneeId ?? "");
  const [note, setNote] = useState("");
  const [reject, setReject] = useState(false);
  const [subject, setSubject] = useState(rejectionTemplate.subject);
  const [body, setBody] = useState(rejectionTemplate.body);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(label: string, url: string, data: Record<string, unknown>, done: string) {
    setPending(label);
    const res = await apiPost(url, data, csrf);
    setPending(null);
    if (res.data.ok) {
      toast({ kind: "success", title: done });
      router.refresh();
      return res;
    }
    toast({ kind: "error", title: `${label} failed`, body: describeError(res.status, res.data.error) });
    return null;
  }

  async function moveStage() {
    const res = await run("Stage change", "/api/admin/applications/stage", { id: app.id, stage, note: stageNote }, `Moved to ${STAGE_LABEL[stage]}`);
    if (res) setStageNote("");
  }

  async function rate(next: number) {
    const value = next === rating ? null : next;
    setRating(value);
    await run("Rating", "/api/admin/applications/rating", { id: app.id, rating: value }, value ? `Rated ${value} of 5` : "Rating cleared");
  }

  async function saveAssignee(next: string) {
    setAssigneeId(next);
    await run("Assignment", "/api/admin/applications/assign", { id: app.id, assigneeId: next || null }, next ? "Assigned" : "Unassigned");
  }

  async function addNote() {
    if (!note.trim()) return;
    const res = await run("Note", "/api/admin/applications/note", { id: app.id, body: note }, "Note added");
    if (res) setNote("");
  }

  async function downloadCv() {
    setPending("cv");
    const res = await fetch(`/api/admin/applications/cv?id=${app.id}`, { credentials: "same-origin" });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
    setPending(null);
    if (data.ok && data.url) window.open(data.url, "_blank", "noopener");
    else toast({ kind: "error", title: "Could not create a download link", body: describeError(res.status, data.error) });
  }

  async function sendRejection() {
    setPending("reject");
    const res = await apiPost<{ sent: boolean; error: string | null }>("/api/admin/applications/reject", { id: app.id, subject, body, saveAsTemplate: saveTemplate }, csrf);
    setPending(null);
    if (res.data.ok) {
      setReject(false);
      toast({ kind: res.data.sent ? "success" : "info", title: res.data.sent ? "Rejection email sent" : "Moved to Rejected, email not sent", body: res.data.sent ? undefined : res.data.error ?? undefined });
      router.refresh();
    } else toast({ kind: "error", title: "Rejection not sent", body: describeError(res.status, res.data.error) });
  }

  async function remove() {
    setPending("delete");
    const res = await apiPost("/api/admin/applications/delete", { id: app.id }, csrf);
    setPending(null);
    if (res.data.ok) {
      toast({ kind: "success", title: "Application deleted", body: "The CV was removed from storage." });
      router.push("/admin/applications");
    } else toast({ kind: "error", title: "Not deleted", body: describeError(res.status, res.data.error) });
  }

  const busy = pending !== null;

  return (
    <div className="adm-stack">
      <Card title="Stage">
        <div className="adm-form" style={{ marginBlockStart: 0 }}>
          <div className="adm-actions">
            <Badge tone={app.stage === "hired" || app.stage === "offer" ? "ok" : app.stage === "rejected" ? "danger" : app.stage === "new" ? "info" : "muted"}>{STAGE_LABEL[app.stage]}</Badge>
            {app.rejectionSentAt && <span className="adm-help">Rejection emailed {app.rejectionSentAt.slice(0, 16).replace("T", " ")} UTC</span>}
          </div>
          {canWrite && (
            <>
              <Select id="ap-stage" label="Move to" options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} disabled={busy} />
              <Input id="ap-stage-note" label="Note for the trail" help="Optional. Recorded with the stage change." value={stageNote} onChange={(e) => setStageNote(e.target.value)} maxLength={2000} disabled={busy} />
              <div className="adm-actions">
                <Button size="sm" disabled={busy || stage === app.stage} onClick={moveStage}>{pending === "Stage change" ? "Saving" : "Change stage"}</Button>
                <Button size="sm" variant="danger" disabled={busy || app.stage === "rejected"} onClick={() => setReject(true)}><Icon name="logout" size={16} /> Send rejection</Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="Rating">
        <div className="adm-rating" role="group" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`adm-star${rating !== null && n <= rating ? " adm-star-on" : ""}`} aria-pressed={rating !== null && n <= rating} aria-label={`${n} star${n === 1 ? "" : "s"}`} disabled={!canWrite || busy} onClick={() => rate(n)}>
              ★
            </button>
          ))}
          <span className="adm-help">{rating ? `${rating} of 5` : "Unrated"}</span>
        </div>
      </Card>

      <Card title="Assignment">
        <Select id="ap-assignee" label="Assigned to" options={[{ value: "", label: "Nobody" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} value={assigneeId} onChange={(e) => saveAssignee(e.target.value)} disabled={!canWrite || busy} />
      </Card>

      <Card title="CV">
        {app.cvFilename ? (
          <div className="adm-form" style={{ marginBlockStart: 0 }}>
            <p>{app.cvFilename}{app.cvSize ? ` (${Math.max(1, Math.round(app.cvSize / 1024))} KB)` : ""}</p>
            <div className="adm-actions">
              <Button size="sm" variant="ghost" onClick={downloadCv} disabled={busy}><Icon name="download" size={16} /> Download CV</Button>
            </div>
            <p className="adm-help">Opens a signed link valid for one minute. Each download is recorded in the audit log.</p>
          </div>
        ) : (
          <p className="adm-empty">No CV on file.</p>
        )}
      </Card>

      {canWrite && (
        <Card title="Add a note">
          <div className="adm-form" style={{ marginBlockStart: 0 }}>
            <Textarea id="ap-note" label="Internal note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} disabled={busy} help="Visible to staff only." />
            <div className="adm-actions">
              <Button size="sm" disabled={busy || !note.trim()} onClick={addNote}>{pending === "Note" ? "Saving" : "Add note"}</Button>
            </div>
          </div>
        </Card>
      )}

      {canDelete && (
        <Card title="Retention">
          <p>Hard delete removes the application, its notes, its trail and the CV from storage. Use it for a data removal request.</p>
          <div className="adm-actions" style={{ marginBlockStart: 12 }}>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete application</Button>
          </div>
        </Card>
      )}

      <Modal
        id="reject-application"
        open={reject}
        onClose={() => setReject(false)}
        title={`Send a rejection to ${app.name}`}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setReject(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={sendRejection} disabled={busy || !subject.trim() || !body.trim()}>{pending === "reject" ? "Sending" : "Send and mark rejected"}</Button>
          </>
        }
      >
        <div className="adm-form" style={{ marginBlockStart: 0 }}>
          <Alert kind="info" live={false}>Placeholders: {"{{first_name}}"}, {"{{name}}"}, {"{{job}}"}, {"{{company}}"}. This one goes to {app.email} for {app.jobTitle}.</Alert>
          <Input id="rej-subject" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          <Textarea id="rej-body" label="Message" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10_000} />
          <Checkbox id="rej-save" label="Save this wording as the default rejection template" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
        </div>
      </Modal>

      <ConfirmDialog
        key={confirmDelete ? "open" : "closed"}
        id="delete-application"
        open={confirmDelete}
        title={`Delete ${app.name}'s application?`}
        body="This cannot be undone. Type DELETE to confirm."
        confirmLabel="Delete application"
        typed="DELETE"
        pending={pending === "delete"}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
