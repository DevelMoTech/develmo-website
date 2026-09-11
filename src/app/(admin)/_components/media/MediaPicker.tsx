"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaView } from "@/lib/admin/media";
import { apiPost, describeError } from "../api-client";
import { Alert, Skeleton } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { ACCEPTED_IMAGE_TYPES, UPLOAD_LIMIT_MB, upload, uploadMessage } from "./upload-client";

type ListResponse = { items: MediaView[]; total: number; page: number; pageSize: number; folders: string[] };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Image picker for the post editor (brief §3.10). Two ways in: the library,
// where only images with alt text can be attached and anything without gets
// an inline alt field; or an upload from this computer, which asks for the
// alt text first so the new image is usable the moment it lands. The hero
// image, the sharing image and the body's insert image all open this one
// picker, so all three get both.
export function MediaPicker({
  open,
  onClose,
  onPick,
  csrf,
  canWrite,
  title = "Choose an image",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: MediaView) => void;
  csrf: string;
  canWrite: boolean;
  title?: string;
}) {
  const [source, setSource] = useState<"library" | "upload">("library");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [page, setPage] = useState(1);
  const term = q.trim();
  const [result, setResult] = useState<{ key: string; data: ListResponse | null; error: string | null } | null>(null);
  const key = `${term}|${folder}|${page}`;
  const loaded = result && result.key === key ? result : null;

  useEffect(() => {
    if (!open || source !== "library") return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({ q: term, folder, page: String(page) });
        const res = await fetch(`/api/admin/media/list?${sp}`, { signal: ctrl.signal, credentials: "same-origin" });
        const data = (await res.json()) as { ok: boolean } & ListResponse;
        setResult({ key, data: data.ok ? data : null, error: data.ok ? null : "Could not load the library." });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResult({ key, data: null, error: "Could not load the library." });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, source, term, folder, page, key]);

  const data = loaded?.data ?? null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Modal id="media-picker" open={open} onClose={onClose} title={title} wide>
      {canWrite && (
        <div className="adm-tabs adm-tabs-sm adm-picker-tabs" role="tablist" aria-label="Where the image comes from">
          <button type="button" role="tab" id="picker-tab-library" aria-selected={source === "library"} aria-controls="picker-panel-library" className="adm-tab" onClick={() => setSource("library")}>
            <Icon name="grid" size={16} /> From the library
          </button>
          <button type="button" role="tab" id="picker-tab-upload" aria-selected={source === "upload"} aria-controls="picker-panel-upload" className="adm-tab" onClick={() => setSource("upload")}>
            <Icon name="upload" size={16} /> Upload from this computer
          </button>
        </div>
      )}

      {source === "upload" && canWrite ? (
        <div id="picker-panel-upload" role="tabpanel" aria-labelledby="picker-tab-upload">
          <UploadPanel csrf={csrf} folder={folder === "/" ? "" : folder} onUploaded={onPick} />
        </div>
      ) : (
        <div id="picker-panel-library" role="tabpanel" aria-labelledby={canWrite ? "picker-tab-library" : undefined}>
          <div className="adm-toolbar" style={{ marginBlockEnd: 12 }}>
            <div className="adm-field adm-field-q">
              <label className="adm-label" htmlFor="picker-q">Search file name or alt text</label>
              <input id="picker-q" className="adm-input" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="picker-folder">Folder</label>
              <select id="picker-folder" className="adm-input adm-select" value={folder} onChange={(e) => { setFolder(e.target.value); setPage(1); }}>
                <option value="">All folders</option>
                <option value="/">Root only</option>
                {(data?.folders ?? []).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
          {loaded?.error && <Alert kind="error">{loaded.error}</Alert>}
          {!loaded && (
            <div className="adm-media-grid" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} height={140} />
              ))}
            </div>
          )}
          {data && data.items.length === 0 && (
            <p className="adm-empty">
              {term || folder ? "No images match." : canWrite ? "The library is empty. Use the upload tab to add the first image." : "The library is empty. Upload images at Media first."}
            </p>
          )}
          {data && data.items.length > 0 && (
            <ul className="adm-media-grid" aria-label="Images">
              {data.items.map((m) => (
                <PickerItem key={m.id} media={m} csrf={csrf} canWrite={canWrite} onPick={onPick} />
              ))}
            </ul>
          )}
          {data && pages > 1 && (
            <div className="adm-actions" style={{ justifyContent: "center", marginBlockStart: 12 }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="adm-muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
              <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// One file, its alt text, then it is uploaded and handed straight back to
// whoever opened the picker. The library's own uploader takes many files
// without alt text and leaves that for later; here the image is about to be
// used, so the alt text comes first.
function UploadPanel({ csrf, folder, onUploaded }: { csrf: string; folder: string; onUploaded: (m: MediaView) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Derived from the file rather than set in an effect; the effect only
  // gives the object URL back when it is replaced or the panel goes away.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(files: FileList | null) {
    const f = files?.[0] ?? null;
    setError(null);
    setFile(f);
  }

  async function send() {
    if (!file) return;
    const altText = alt.trim();
    if (!altText) {
      setError("Write the alt text first. It is what a screen reader says, and what shows when the image cannot load.");
      return;
    }
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("file", file);
    form.set("folder", folder);
    form.set("altText", altText);
    const res = await upload("/api/admin/media/upload", form, csrf, setProgress);
    setProgress(null);
    if (res.data.ok && res.data.media) {
      onUploaded(res.data.media);
      return;
    }
    const issue = res.data.issues?.[0];
    setError(issue ? `${issue.path}: ${issue.message}` : uploadMessage(res.status, res.data.error));
  }

  const busy = progress !== null;

  return (
    <div className="adm-picker-upload">
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
          choose(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={28} />
        <p>
          Drag an image here, or{" "}
          <button type="button" className="adm-link" onClick={() => input.current?.click()} disabled={busy}>choose a file</button>.
        </p>
        <p className="adm-help">JPEG, PNG, GIF or WebP up to {UPLOAD_LIMIT_MB} MB. SVG is refused. Metadata is stripped on upload.</p>
        <input ref={input} type="file" accept={ACCEPTED_IMAGE_TYPES} className="adm-sr" aria-label="Choose an image to upload" onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
      </div>

      {file && (
        <div className="adm-picker-chosen">
          {preview && (
            <div className="adm-media-thumb adm-picker-preview">
              <img src={preview} alt="" />
            </div>
          )}
          <div className="adm-picker-chosen-fields">
            <div className="adm-help">{file.name}, {formatBytes(file.size)}</div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="picker-alt">Alt text (required)</label>
              <input id="picker-alt" className="adm-input" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} disabled={busy} placeholder="What the image shows, in a sentence" />
              <p className="adm-help">Describe what the image shows. Decorative images still need a short description here so they can be found in the library.</p>
            </div>
            {busy && <progress value={progress ?? 0} max={100} aria-label={`Uploading ${file.name}`} style={{ inlineSize: "100%" }} />}
            {error && (
              <div className="adm-alert adm-alert-error" role="alert">
                <p>{error}</p>
              </div>
            )}
            <div className="adm-actions">
              <Button onClick={send} disabled={busy || !alt.trim()}>{busy ? "Uploading" : "Upload and use this image"}</Button>
              <Button variant="ghost" onClick={() => { setFile(null); setAlt(""); setError(null); }} disabled={busy}>Choose a different file</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PickerItem({ media, csrf, canWrite, onPick }: { media: MediaView; csrf: string; canWrite: boolean; onPick: (m: MediaView) => void }) {
  const toast = useToast();
  const [alt, setAlt] = useState(media.altText);
  const [saved, setSaved] = useState(media.altText);
  const [pending, setPending] = useState(false);
  const hasAlt = saved.trim().length > 0;

  async function saveAlt() {
    setPending(true);
    const res = await apiPost<{ media: MediaView }>("/api/admin/media/update", { id: media.id, altText: alt.trim(), folder: media.folder, tags: media.tags, filename: media.filename }, csrf);
    setPending(false);
    if (res.data.ok) {
      setSaved(alt.trim());
      toast({ kind: "success", title: "Alt text saved" });
    } else toast({ kind: "error", title: "Alt text not saved", body: describeError(res.status, res.data.error) });
  }

  return (
    <li className="adm-media-item">
      <div className="adm-media-thumb">
        <img src={media.url} alt={saved || ""} loading="lazy" />
      </div>
      <div className="adm-media-meta">
        <div className="adm-media-name" title={media.filename}>{media.filename}</div>
        <div className="adm-help">{media.width && media.height ? `${media.width}×${media.height}, ` : ""}{formatBytes(media.size)}</div>
        {hasAlt ? (
          <Button size="sm" onClick={() => onPick({ ...media, altText: saved })}>Use this image</Button>
        ) : canWrite ? (
          <div className="adm-field">
            <label className="adm-label" htmlFor={`alt-${media.id}`}>Alt text (required)</label>
            <input id={`alt-${media.id}`} className="adm-input" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} />
            <Button size="sm" variant="ghost" disabled={pending || !alt.trim()} onClick={saveAlt}>Save alt text</Button>
          </div>
        ) : (
          <p className="adm-help">Needs alt text before it can be used.</p>
        )}
      </div>
    </li>
  );
}
