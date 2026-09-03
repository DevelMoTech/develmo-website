"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_ROBOTS_BODY, PROTECTED_PATHS, renderRobots, validateRobots } from "@/lib/seo/robots";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";
import { useToast } from "../ui/Toast";

export function RobotsEditor({ initial, rendered, csrf, canWrite, robotsUrl }: { initial: string; rendered: string; csrf: string; canWrite: boolean; robotsUrl: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const report = useMemo(() => validateRobots(body), [body]);
  const preview = useMemo(() => renderRobots(body), [body]);
  const dirty = body !== initial;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await apiPost<{ rendered: string; warnings: string[] }>("/api/admin/seo/robots/save", { body }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "robots.txt saved", body: "Served on the next request." });
      router.refresh();
    } else {
      const raw = res.data as { errors?: string[] };
      toast({ kind: "error", title: "Not saved", body: raw.errors?.[0] ?? describeError(res.status, res.data.error) });
    }
  }

  async function reset() {
    setPending(true);
    const res = await apiPost<{ body: string }>("/api/admin/seo/robots/reset", {}, csrf);
    setPending(false);
    if (res.data.ok) {
      setBody(res.data.body);
      toast({ kind: "success", title: "robots.txt reset", body: "Back to the file the site shipped with." });
      router.refresh();
    } else toast({ kind: "error", title: "Not reset", body: describeError(res.status, res.data.error) });
  }

  return (
    <div className="adm-split">
      <form className="adm-card adm-form" onSubmit={save} noValidate aria-labelledby="robots-editor-title">
        <h2 id="robots-editor-title" className="adm-card-head" style={{ margin: 0 }}>Body</h2>
        <Textarea id="robots-body" label="robots.txt" rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="adm-code-field" disabled={!canWrite || pending} spellCheck={false} help={`Directives: User-agent, Allow, Disallow, Crawl-delay, Sitemap, Host. ${PROTECTED_PATHS.join(" and ")} are added to every group when served.`} />
        {report.errors.length > 0 && (
          <Alert kind="error">
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Alert>
        )}
        {report.errors.length === 0 && report.warnings.length > 0 && (
          <Alert kind="warn" live={false}>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Alert>
        )}
        {report.errors.length === 0 && report.warnings.length === 0 && <Alert kind="success" live={false}>Valid.</Alert>}
        {canWrite && (
          <div className="adm-actions">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending || body === DEFAULT_ROBOTS_BODY}>Reset to default</Button>
            <Button type="submit" size="sm" disabled={pending || !dirty || report.errors.length > 0}>{pending ? "Saving" : "Save robots.txt"}</Button>
          </div>
        )}
      </form>
      <Card title="What will be served" description="The body above with the hard rule applied. Compare with the live file." actions={<a className="adm-btn adm-btn-ghost adm-btn-sm" href={robotsUrl} target="_blank" rel="noreferrer">Open robots.txt</a>}>
        <pre className="adm-pre" aria-label="Rendered robots.txt">{preview}</pre>
        {preview !== rendered && dirty && <p className="adm-help">Unsaved changes; the live file still matches what was saved last.</p>}
      </Card>
    </div>
  );
}
