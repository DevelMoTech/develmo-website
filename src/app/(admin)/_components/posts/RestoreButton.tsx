"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, describeError } from "../api-client";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Modal";
import { useToast } from "../ui/Toast";

// One-click restore (brief §3.3): the restore itself writes a new revision,
// so nothing is ever lost.
export function RestoreButton({ csrf, postId, revisionId, label }: { csrf: string; postId: string; revisionId: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function restore() {
    setPending(true);
    const res = await apiPost<{ slugKept: boolean }>("/api/admin/posts/restore", { postId, revisionId }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Revision restored", body: res.data.slugKept ? "The slug from that revision is now taken, so the current slug was kept." : "A new revision records the restore." });
      setOpen(false);
      router.push(`/admin/posts/${postId}`);
      router.refresh();
    } else toast({ kind: "error", title: "Not restored", body: describeError(res.status, res.data.error) });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={pending}>Restore</Button>
      <ConfirmDialog
        id={`restore-${revisionId}`}
        open={open}
        title={`Restore the revision from ${label}?`}
        body="The post's fields, status and translations are replaced with that snapshot. The current state is saved as a revision first, so you can come back."
        confirmLabel="Restore"
        tone="primary"
        pending={pending}
        onConfirm={restore}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
