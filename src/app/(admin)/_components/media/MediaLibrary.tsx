"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MediaView, Usage } from "@/lib/admin/media";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { formatBytes } from "./MediaPicker";

export type LibraryItem = MediaView & { usage: Usage[] };

type UploadState = { id: number; name: string; progress: number; status: "uploading" | "done" | "error"; message?: string };

const UPLOAD_ERRORS: Record<string, string> = {
  svg_rejected: "SVG files are not accepted: they can carry scripts. Export a PNG or JPEG instead.",
  unsupported_type: "Only JPEG, PNG, GIF and WebP images are accepted. The file's bytes decide, not its name.",
  too_large: `Larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
  empty: "The file is empty.",
  type_mismatch: "A replacement must be the same format as the original so the URL keeps working.",
};

function uploadMessage(status: number, code?: string): string {
  return (code && UPLOAD_ERRORS[code]) || describeError(status, code);
}

// XMLHttpRequest for upload progress; fetch has none.
function upload(url: string, form: FormData, csrf: string, onProgress: (pct: number) => void): Promise<{ status: number; data: { ok: boolean; error?: string; media?: MediaView } }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-csrf-token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { ok: boolean; error?: string; media?: MediaView } = { ok: false, error: "bad_response" };
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ status: 0, data: { ok: false, error: "network" } });
    xhr.send(form);
  });
}

export function Uploader({ csrf, folder }: { csrf: string; folder: string }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const seq = useRef(0);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    let added = 0;
    await Promise.all(
      list.map(async (file) => {
        const id = ++seq.current;
        setUploads((u) => [...u, { id, name: file.name, progress: 0, status: "uploading" }]);
        const form = new FormData();
        form.set("file", file);
        form.set("folder", folder);
        const res = await upload("/api/admin/media/upload", form, csrf, (pct) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: pct } : x))));
        if (res.data.ok) {
          added += 1;
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: 100, status: "done" } : x)));
        } else {
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "error", message: uploadMessage(res.status, res.data.error) } : x)));
        }
      }),
    );
    if (added > 0) {
      toast({ kind: "success", title: `${added} file${added === 1 ? "" : "s"} uploaded`, body: "Add alt text before attaching an image to a post." });
      router.refresh();
    }
  }

  return (
    <div>
      <div
        className={`adm-dropzone${drag ? " adm-dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={28} />
        <p>
          Drag images here, or{" "}
          <button type="button" className="adm-link" onClick={() => input.current?.click()}>choose files</button>.
        </p>
        <p className="adm-help">JPEG, PNG, GIF or WebP up to {Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB each. SVG is refused. Metadata is stripped on upload.{folder ? ` Uploading into ${folder}.` : ""}</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="adm-sr"
          aria-label="Choose images to upload"
          onChange={(e) => {
            if (e.target.files) void send(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {uploads.length > 0 && (
        <ul className="adm-uploads" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className={`adm-upload adm-upload-${u.status}`}>
              <span className="adm-media-name">{u.name}</span>
              {u.status === "uploading" && <progress value={u.progress} max={100} aria-label={`Uploading ${u.name}`} />}
              {u.status === "done" && <Badge tone="ok">Uploaded</Badge>}
              {u.status === "error" && <span className="adm-error">{u.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MediaBrowser({ csrf, items, view, canWrite, folders }: { csrf: string; items: LibraryItem[]; view: "grid" | "list"; canWrite: boolean; folders: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((i) => i.id === openId) ?? null;
  return (
    <>
      {view === "grid" ? (
        <ul className="adm-media-grid" aria-label="Files">
          {items.map((m) => (
            <li key={m.id} className="adm-media-item">
              <button type="button" className="adm-media-thumb adm-media-open" onClick={() => setOpenId(m.id)} aria-label={`Open ${m.filename}`}>
                <img src={m.url} alt={m.altText} loading="lazy" />
              </button>
              <div className="adm-media-meta">
                <div className="adm-media-name" title={m.filename}>{m.filename}</div>
                <div className="adm-help">
                  {m.width && m.height ? `${m.width}×${m.height}, ` : ""}{formatBytes(m.size)}
                  {m.altText ? "" : " · no alt text"}
                  {m.usage.length ? ` · used ${m.usage.length}×` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="adm-sr">Files</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Alt text</th>
                <th scope="col">Folder</th>
                <th scope="col">Size</th>
                <th scope="col">Used</th>
                <th scope="col">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td data-label="File">
                    <button type="button" className="adm-media-row" onClick={() => setOpenId(m.id)}>
                      <img src={m.url} alt="" width={40} height={40} loading="lazy" />
                      <span>{m.filename}</span>
                    </button>
                  </td>
                  <td data-label="Alt text">{m.altText || <Badge tone="warn">missing</Badge>}</td>
                  <td data-label="Folder">{m.folder || <span className="adm-muted">root</span>}</td>
                  <td data-label="Size">{m.width && m.height ? `${m.width}×${m.height}, ` : ""}{formatBytes(m.size)}</td>
                  <td data-label="Used">{m.usage.length}</td>
                  <td data-label="Uploaded">{m.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <MediaDetails key={open.id} csrf={csrf} item={open} canWrite={canWrite} folders={folders} onClose={() => setOpenId(null)} />}
    </>
  );
}

function MediaDetails({ csrf, item, canWrite, folders, onClose }: { csrf: string; item: LibraryItem; canWrite: boolean; folders: string[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [altText, setAltText] = useState(item.altText);
  const [folder, setFolder] = useState(item.folder);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [filename, setFilename] = useState(item.filename);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replaceState, setReplaceState] = useState<{ progress: number; error?: string } | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const dirty = altText !== item.altText || folder !== item.folder || tags !== item.tags.join(", ") || filename !== item.filename;

  async function save() {
    setPending(true);
    setIssues({});
    const res = await apiPost<{ media: MediaView }>("/api/admin/media/update", { id: item.id, altText, folder, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), filename }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Details saved" });
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
    }
  }

  async function remove() {
    setPending(true);
    const res = await apiPost<{ usage?: Usage[] }>("/api/admin/media/delete", { id: item.id }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "File deleted" });
      setConfirmDelete(false);
      onClose();
      router.refresh();
    } else {
      setConfirmDelete(false);
      toast({ kind: "error", title: res.data.error === "in_use" ? "Still in use" : "Not deleted", body: res.data.error === "in_use" ? `Referenced by ${res.data.usage?.length ?? 0} post${res.data.usage?.length === 1 ? "" : "s"}. Remove it there first.` : describeError(res.status, res.data.error) });
    }
  }

  async function replaceWith(file: File) {
    setReplaceState({ progress: 0 });
    const form = new FormData();
    form.set("id", item.id);
    form.set("file", file);
    const res = await upload("/api/admin/media/replace", form, csrf, (p) => setReplaceState({ progress: p }));
    if (res.data.ok) {
      setReplaceState(null);
      toast({ kind: "success", title: "File replaced", body: "Same address, new bytes. Cached copies refresh within a few minutes." });
      router.refresh();
    } else setReplaceState({ progress: 0, error: uploadMessage(res.status, res.data.error) });
  }

  async function download() {
    const res = await fetch(`/api/admin/media/download?id=${item.id}`, { credentials: "same-origin" });
    const data = (await res.json()) as { ok: boolean; url?: string };
    if (data.ok && data.url) window.open(data.url, "_blank", "noopener");
    else toast({ kind: "error", title: "Could not create a download link" });
  }

  return (
    <Modal
      id="media-details"
      open
      wide
      onClose={onClose}
      title={item.filename}
      footer={
        canWrite ? (
          <>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={pending || item.usage.length > 0} title={item.usage.length > 0 ? "In use, cannot delete" : undefined}>
              <Icon name="trash" size={16} /> Delete
            </Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button onClick={save} disabled={pending || !dirty}>{pending ? "Saving" : "Save details"}</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="adm-media-detail">
        <div className="adm-media-preview">
          <img src={item.url} alt={item.altText} width={item.width ?? undefined} height={item.height ?? undefined} />
          <dl className="adm-dl">
            <dt>Type</dt>
            <dd>{item.contentType}</dd>
            <dt>Size</dt>
            <dd>{item.width && item.height ? `${item.width}×${item.height}, ` : ""}{formatBytes(item.size)}</dd>
            <dt>Address</dt>
            <dd className="adm-mono">{item.url}</dd>
            <dt>Uploaded</dt>
            <dd>{item.createdAt.slice(0, 16).replace("T", " ")} UTC{item.replacedAt ? `, replaced ${item.replacedAt.slice(0, 16).replace("T", " ")} UTC` : ""}</dd>
          </dl>
          <div className="adm-actions">
            <Button variant="ghost" size="sm" onClick={download}><Icon name="download" size={16} /> Download original</Button>
            {canWrite && (
              <>
                <Button variant="ghost" size="sm" onClick={() => replaceInput.current?.click()} disabled={replaceState !== null && !replaceState.error}><Icon name="refresh" size={16} /> Replace file</Button>
                <input
                  ref={replaceInput}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="adm-sr"
                  aria-label="Choose a replacement file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void replaceWith(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
          {replaceState && !replaceState.error && <progress value={replaceState.progress} max={100} aria-label="Replacing" />}
          {replaceState?.error && <Alert kind="error">{replaceState.error}</Alert>}
        </div>
        <div className="adm-form" style={{ marginBlockStart: 0 }}>
          <Input id="m-alt" label="Alt text" help={altText ? undefined : "Required before this image can be attached to a post."} value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={300} error={issues.altText} disabled={!canWrite || pending} />
          <Input id="m-filename" label="File name" value={filename} onChange={(e) => setFilename(e.target.value)} maxLength={160} error={issues.filename} disabled={!canWrite || pending} />
          <Input id="m-folder" label="Folder" help="Lowercase, hyphens, / between levels. Blank is the root." value={folder} onChange={(e) => setFolder(e.target.value)} list="m-folder-list" error={issues.folder} disabled={!canWrite || pending} />
          <datalist id="m-folder-list">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <Input id="m-tags" label="Tags" help="Comma separated." value={tags} onChange={(e) => setTags(e.target.value)} error={issues.tags} disabled={!canWrite || pending} />
          <div>
            <div className="adm-label">Used in</div>
            {item.usage.length === 0 ? (
              <p className="adm-help">Not referenced by any post. It can be deleted.</p>
            ) : (
              <ul className="adm-usage">
                {item.usage.map((u, i) => (
                  <li key={`${u.postId}-${u.via}-${i}`}>
                    <Link href={`/admin/posts/${u.postId}`} className="adm-link">{u.title}</Link> <Badge tone="muted">{u.via === "hero" ? "hero image" : u.via === "og" ? "sharing image" : "in body"}</Badge> <span className="adm-help">{u.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        id="delete-media"
        open={confirmDelete}
        title={`Delete ${item.filename}?`}
        body="The file is removed from storage. This cannot be undone."
        confirmLabel="Delete file"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
