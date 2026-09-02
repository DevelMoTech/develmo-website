"use client";

import { useEffect, useState } from "react";
import { apiPost } from "../api-client";

// Markdown textarea with a Write/Preview toggle. The preview is rendered by
// /api/admin/posts/render, the same remark + rehype-sanitize pipeline the
// public pages use, so what is injected here is already sanitized.
export function MarkdownField({
  id,
  label,
  value,
  onChange,
  csrf,
  help,
  error,
  disabled,
  rows = 8,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  csrf: string;
  help?: string;
  error?: string;
  disabled?: boolean;
  rows?: number;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<{ markdown: string; html: string } | null>(null);

  useEffect(() => {
    if (tab !== "preview") return;
    if (preview && preview.markdown === value) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await apiPost<{ html: string }>("/api/admin/posts/render", { markdown: value }, csrf);
      if (!ctrl.signal.aborted) setPreview({ markdown: value, html: res.data.ok ? res.data.html : "<p>Preview unavailable.</p>" });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [tab, value, csrf, preview]);

  return (
    <div className="adm-field">
      <div className="adm-editor-bodyhead">
        <label className="adm-label" htmlFor={id}>{label}</label>
        <div className="adm-tabs adm-tabs-sm" role="tablist" aria-label={`${label} view`}>
          <button type="button" role="tab" aria-selected={tab === "write"} className="adm-tab" onClick={() => setTab("write")}>Write</button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className="adm-tab" onClick={() => setTab("preview")}>Preview</button>
        </div>
      </div>
      {tab === "write" ? (
        <textarea id={id} className="adm-input adm-editor-body adm-editor-body-short" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={`${id}-help`} disabled={disabled} spellCheck />
      ) : (
        <div className="adm-md-preview adm-md-preview-short prose" aria-live="polite" aria-busy={preview?.markdown !== value}>
          {preview && preview.markdown === value ? (
            value.trim() ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p className="adm-muted">Nothing to preview yet.</p>
          ) : (
            <p className="adm-muted">Rendering preview</p>
          )}
        </div>
      )}
      <p id={`${id}-help`} className={error ? "adm-error" : "adm-help"}>{error ?? help ?? "Markdown: headings, lists, links. Raw HTML is removed."}</p>
    </div>
  );
}
