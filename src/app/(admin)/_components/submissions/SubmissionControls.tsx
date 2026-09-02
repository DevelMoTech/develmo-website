"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NoteRow } from "@/lib/admin/submissions";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/schemas/submission";
import { apiPost, describeError } from "../api-client";
import { Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { ConfirmDialog } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const STATUS_LABEL: Record<SubmissionStatus, string> = { new: "New", read: "Read", in_progress: "In progress", qualified: "Qualified", won: "Won", lost: "Lost", spam: "Spam" };

type Delivery = { status: string; channel: string | null; error: string | null };

function deliveryToast(d: Delivery): { kind: "success" | "error" | "info"; title: string; body?: string } {
  if (d.status === "sent") return { kind: "success", title: `Delivered via ${d.channel}`, body: d.error ? `Earlier channels failed: ${d.error}` : undefined };
  if (d.status === "skipped") return { kind: "info", title: "Delivery skipped", body: d.error ?? undefined };
  return { kind: "error", title: "Delivery failed", body: d.error ?? undefined };
}

// Spam view row actions: restore ("not spam") delivers a held contact enquiry.
export function SpamRowActions({ csrf, id, label }: { csrf: string; id: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function restore() {
    setPending(true);
    const res = await apiPost<{ delivery: Delivery | null }>("/api/admin/submissions/spam", { id, spam: false }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Restored to the inbox" });
      if (res.data.delivery) toast(deliveryToast(res.data.delivery));
      router.refresh();
    } else toast({ kind: "error", title: "Not restored", body: describeError(res.status, res.data.error) });
  }
  return (
    <div className="adm-actions">
      <Button size="sm" variant="ghost" onClick={restore} disabled={pending} aria-label={`Not spam: restore ${label}`}>Not spam</Button>
    </div>
  );
}

export type SubmissionView = {
  id: string;
  kind: string;
  status: SubmissionStatus;
  isSpam: boolean;
  name: string;
  email: string;
  assigneeId: string | null;
  tags: string[];
  deliveryStatus: string;
  deliveryChannel: string | null;
  deliveryError: string | null;
  deliveryAttempts: number;
  lastDeliveryAt: string | null;
  mailto: string;
};

// Triage for one submission (brief §3.5): status, assignment, tags, threaded
// notes, replay delivery, spam toggle, reply by mail, hard delete. The
// selects save on change and stay enabled (and focused) while they do; a
// failed save rolls the control back.
export function SubmissionControls({
  csrf,
  item,
  notes,
  staff,
  canWrite,
  canDelete,
}: {
  csrf: string;
  item: SubmissionView;
  notes: NoteRow[];
  staff: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState(item.status);
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [savedTags, setSavedTags] = useState(item.tags.join(", "));
  const [note, setNote] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = pending !== null;

  async function save(label: string, url: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (busy) return null;
    setPending(label);
    const res = await apiPost<Record<string, unknown>>(url, data, csrf);
    setPending(null);
    if (res.data.ok) return res.data;
    toast({ kind: "error", title: `${label} failed`, body: describeError(res.status, res.data.error) });
    return null;
  }

  async function saveStatus(next: SubmissionStatus) {
    const previous = status;
    setStatus(next);
    const res = await save("Status", "/api/admin/submissions/update", { id: item.id, status: next });
    if (res) {
      toast({ kind: "success", title: `Status: ${STATUS_LABEL[next]}` });
      router.refresh();
    } else setStatus(previous);
  }

  async function saveAssignee(next: string) {
    const previous = assigneeId;
    setAssigneeId(next);
    const res = await save("Assignment", "/api/admin/submissions/update", { id: item.id, assigneeId: next || null });
    if (res) {
      toast({ kind: "success", title: next ? "Assigned" : "Unassigned" });
      router.refresh();
    } else setAssigneeId(previous);
  }

  async function saveTags() {
    const list = [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    const normalised = list.join(", ");
    setTags(normalised);
    if (normalised === savedTags) return;
    const res = await save("Tags", "/api/admin/submissions/update", { id: item.id, tags: list });
    if (res) {
      setSavedTags(normalised);
      toast({ kind: "success", title: "Tags saved" });
      router.refresh();
    } else setTags(savedTags);
  }

  async function addNote(body: string, parentId: string | null) {
    if (!body.trim()) return;
    const res = await save("Note", "/api/admin/submissions/note", { id: item.id, body, parentId });
    if (!res) return;
    toast({ kind: "success", title: parentId ? "Reply added" : "Note added" });
    if (parentId) {
      setReply("");
      setReplyTo(null);
    } else setNote("");
    router.refresh();
  }

  async function replay() {
    const res = (await save("Replay", "/api/admin/submissions/replay", { id: item.id })) as { delivery?: Delivery } | null;
    if (!res) return;
    if (res.delivery) toast(deliveryToast(res.delivery));
    router.refresh();
  }

  async function toggleSpam(spam: boolean) {
    const res = (await save(spam ? "Mark as spam" : "Restore", "/api/admin/submissions/spam", { id: item.id, spam })) as { delivery?: Delivery | null } | null;
    if (!res) return;
    toast({ kind: "success", title: spam ? "Marked as spam" : "Restored to the inbox" });
    if (res.delivery) toast(deliveryToast(res.delivery));
    router.refresh();
  }

  async function remove() {
    setPending("delete");
    const res = await apiPost("/api/admin/submissions/delete", { id: item.id }, csrf);
    setPending(null);
    if (res.data.ok) {
      toast({ kind: "success", title: "Submission deleted" });
      router.push(item.isSpam ? "/admin/submissions/spam" : "/admin/submissions");
    } else toast({ kind: "error", title: "Not deleted", body: describeError(res.status, res.data.error) });
  }

  const topLevel = notes.filter((n) => !n.parentId);
  const replies = (id: string) => notes.filter((n) => n.parentId === id);
  const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

  return (
    <div className="adm-stack">
      <Card title="Triage">
        <div className="adm-form" style={{ marginBlockStart: 0 }}>
          <div className="adm-actions">
            <a className="adm-btn adm-btn-primary adm-btn-sm" href={item.mailto}><Icon name="external" size={16} /> Reply by email</a>
            {canWrite && item.kind === "contact" && !item.isSpam && (
              <Button size="sm" variant="ghost" onClick={replay} disabled={busy}><Icon name="refresh" size={16} /> {item.deliveryStatus === "sent" ? "Send again" : "Replay delivery"}</Button>
            )}
            {canWrite && (item.isSpam ? <Button size="sm" variant="ghost" onClick={() => toggleSpam(false)} disabled={busy}>Not spam</Button> : <Button size="sm" variant="ghost" onClick={() => toggleSpam(true)} disabled={busy}>Mark as spam</Button>)}
          </div>
          {canWrite && !item.isSpam && (
            <>
              <Select id="s-status" label="Status" options={SUBMISSION_STATUSES.filter((s) => s !== "spam").map((s) => ({ value: s, label: STATUS_LABEL[s] }))} value={status} onChange={(e) => saveStatus(e.target.value as SubmissionStatus)} help={pending === "Status" ? "Saving" : undefined} />
              <Select id="s-assignee" label="Assigned to" options={[{ value: "", label: "Nobody" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} value={assigneeId} onChange={(e) => saveAssignee(e.target.value)} help={pending === "Assignment" ? "Saving" : undefined} />
              <Input id="s-tags" label="Tags" help={pending === "Tags" ? "Saving" : "Comma separated. Saved when you leave the field."} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveTags} />
            </>
          )}
          {!canWrite && (
            <dl className="adm-dl">
              <dt>Status</dt>
              <dd><Badge>{STATUS_LABEL[item.status]}</Badge></dd>
              <dt>Tags</dt>
              <dd>{item.tags.length ? item.tags.join(", ") : "none"}</dd>
            </dl>
          )}
        </div>
      </Card>

      <Card title={`Notes (${notes.length})`} description="Internal, threaded. Visible to staff only.">
        {topLevel.length === 0 && <p className="adm-empty">No notes yet.</p>}
        <ul className="adm-thread">
          {topLevel.map((n) => (
            <li key={n.id}>
              <div className="adm-note">
                <p>{n.body}</p>
                <div className="adm-help">
                  {n.authorName ?? "Removed user"} · {when(n.createdAt)}
                  {canWrite && (
                    <>
                      {" "}
                      · <button type="button" className="adm-link" aria-expanded={replyTo === n.id} aria-label={`Reply to the note from ${n.authorName ?? "a removed user"} at ${when(n.createdAt)}`} onClick={() => setReplyTo(replyTo === n.id ? null : n.id)}>Reply</button>
                    </>
                  )}
                </div>
              </div>
              {replies(n.id).length > 0 && (
                <ul className="adm-thread adm-thread-replies">
                  {replies(n.id).map((r) => (
                    <li key={r.id}>
                      <div className="adm-note">
                        <p>{r.body}</p>
                        <div className="adm-help">{r.authorName ?? "Removed user"} · {when(r.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {replyTo === n.id && (
                <div className="adm-form adm-thread-replies" style={{ marginBlockStart: 8 }}>
                  <Textarea id={`reply-${n.id}`} label="Reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} disabled={busy} />
                  <div className="adm-actions">
                    <Button size="sm" onClick={() => addNote(reply, n.id)} disabled={busy || !reply.trim()}>Add reply</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)} disabled={busy}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="adm-form">
            <Textarea id="s-note" label="New note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} disabled={busy} />
            <div className="adm-actions">
              <Button size="sm" onClick={() => addNote(note, null)} disabled={busy || !note.trim()}>{pending === "Note" ? "Saving" : "Add note"}</Button>
            </div>
          </div>
        )}
      </Card>

      {canDelete && (
        <Card title="Retention">
          <p>Hard delete removes this submission and its notes{item.kind === "application" ? ", and the application record with its CV" : ""}. Use it for a data removal request; the audit log keeps a record of the deletion.</p>
          <div className="adm-actions" style={{ marginBlockStart: 12 }}>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete submission</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        key={confirmDelete ? "open" : "closed"}
        id="delete-submission"
        open={confirmDelete}
        title={`Delete the submission from ${item.name || item.email}?`}
        body="This cannot be undone. Type DELETE to confirm."
        confirmLabel="Delete submission"
        typed="DELETE"
        pending={pending === "delete"}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
