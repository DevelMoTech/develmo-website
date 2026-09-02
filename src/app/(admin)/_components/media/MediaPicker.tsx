"use client";

import { useEffect, useState } from "react";
import type { MediaView } from "@/lib/admin/media";
import { apiPost, describeError } from "../api-client";
import { Alert, Skeleton } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

type ListResponse = { items: MediaView[]; total: number; page: number; pageSize: number; folders: string[] };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Image picker for the post editor (brief §3.10): only images with alt text
// can be attached; anything without gets an inline alt field so the editor
// can fix it on the spot rather than leave for the library.
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
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [page, setPage] = useState(1);
  const term = q.trim();
  const [result, setResult] = useState<{ key: string; data: ListResponse | null; error: string | null } | null>(null);
  const key = `${term}|${folder}|${page}`;
  const loaded = result && result.key === key ? result : null;

  useEffect(() => {
    if (!open) return;
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
  }, [open, term, folder, page, key]);

  const data = loaded?.data ?? null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Modal id="media-picker" open={open} onClose={onClose} title={title} wide>
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
          {term || folder ? "No images match." : "The library is empty. Upload images at Media first."}
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
    </Modal>
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
