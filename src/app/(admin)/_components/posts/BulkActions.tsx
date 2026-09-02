"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiPost, describeError } from "../api-client";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

type Action = "publish" | "unpublish" | "archive" | "delete" | "retag";

const DONE: Record<Action, string> = { publish: "published", unpublish: "unpublished", archive: "archived", delete: "deleted", retag: "retagged" };

// Wraps the server-rendered posts table in a form: each row carries an
// <input name="ids"> checkbox, the bar above reads the selection from the
// form and posts it to /api/admin/posts/bulk (brief §3.3 bulk actions).
export function BulkForm({ csrf, children, total }: { csrf: string; children: ReactNode; total: number }) {
  const router = useRouter();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<{ ids: string[]; onPage: number }>({ ids: [], onPage: 0 });
  const [pending, setPending] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<"delete" | null>(null);
  const [retag, setRetag] = useState(false);
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState("");

  function readSelection() {
    const f = form.current;
    if (!f) return;
    setSelected({ ids: new FormData(f).getAll("ids").map(String), onPage: f.querySelectorAll('input[name="ids"]').length });
  }

  function selectAll(on: boolean) {
    form.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((el) => {
      el.checked = on;
    });
    readSelection();
  }

  const split = (s: string) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

  async function run(action: Action) {
    if (selected.ids.length === 0 || pending) return;
    setPending(action);
    const res = await apiPost<{ changed: number }>("/api/admin/posts/bulk", { ids: selected.ids, action, addTags: split(addTags), removeTags: split(removeTags) }, csrf);
    setPending(null);
    if (!res.data.ok) {
      toast({ kind: "error", title: "Bulk action failed", body: describeError(res.status, res.data.error) });
      return;
    }
    const n = res.data.changed;
    toast({ kind: "success", title: `${n} post${n === 1 ? "" : "s"} ${DONE[action]}`, body: n < selected.ids.length ? `${selected.ids.length - n} already in that state.` : undefined });
    setConfirm(null);
    setRetag(false);
    setAddTags("");
    setRemoveTags("");
    selectAll(false);
    router.refresh();
  }

  const n = selected.ids.length;
  const busy = pending !== null;

  return (
    <form ref={form} onChange={readSelection} onSubmit={(e) => e.preventDefault()}>
      {total > 0 && (
        <div className="adm-bulkbar" role="toolbar" aria-label="Bulk actions">
          <label className="adm-check">
            <input type="checkbox" checked={n > 0 && n === selected.onPage} onChange={(e) => selectAll(e.target.checked)} aria-label="Select all posts on this page" />
            <span>{n === 0 ? "Select posts" : `${n} selected`}</span>
          </label>
          <div className="adm-actions">
            <Button size="sm" variant="ghost" disabled={n === 0 || busy} onClick={() => run("publish")}>Publish</Button>
            <Button size="sm" variant="ghost" disabled={n === 0 || busy} onClick={() => run("unpublish")}>Unpublish</Button>
            <Button size="sm" variant="ghost" disabled={n === 0 || busy} onClick={() => run("archive")}>Archive</Button>
            <Button size="sm" variant="ghost" disabled={n === 0 || busy} onClick={() => setRetag(true)}>Retag</Button>
            <Button size="sm" variant="danger" disabled={n === 0 || busy} onClick={() => setConfirm("delete")}>Delete</Button>
          </div>
        </div>
      )}
      {children}
      <ConfirmDialog
        key={confirm ? `del-${n}` : "none"}
        id="bulk-delete"
        open={confirm === "delete"}
        title={`Delete ${n} post${n === 1 ? "" : "s"}?`}
        body="This removes the posts, their revisions and translations. Published posts disappear from the site immediately. Type DELETE to confirm."
        confirmLabel="Delete posts"
        typed="DELETE"
        pending={pending === "delete"}
        onConfirm={() => run("delete")}
        onCancel={() => setConfirm(null)}
      />
      <Modal
        id="bulk-retag"
        open={retag}
        onClose={() => setRetag(false)}
        title={`Retag ${n} post${n === 1 ? "" : "s"}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRetag(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => run("retag")} disabled={busy || (!split(addTags).length && !split(removeTags).length)}>{pending === "retag" ? "Working" : "Apply"}</Button>
          </>
        }
      >
        <div className="adm-form" style={{ marginBlockStart: 0 }}>
          <Input id="retag-add" label="Add tags" help="Comma separated." value={addTags} onChange={(e) => setAddTags(e.target.value)} />
          <Input id="retag-remove" label="Remove tags" help="Comma separated." value={removeTags} onChange={(e) => setRemoveTags(e.target.value)} />
        </div>
      </Modal>
    </form>
  );
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} aria-label={`Select ${label}`} className="adm-rowcheck" />;
}
