"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuditRun } from "@/lib/admin/seo";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

// Starts a crawl and polls its status until it finishes, then refreshes the
// run list. Only one crawl runs at a time.
export function AuditRunner({ csrf, canWrite, running }: { csrf: string; canWrite: boolean; running: AuditRun | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  // The server marks a run older than ten minutes as failed before it
  // reaches this page, so a running run here is genuinely in progress; the
  // poll below also gives up after ten minutes.
  const [watching, setWatching] = useState<string | null>(running?.id ?? null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!watching) return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      setSeconds(Math.round((Date.now() - started) / 1000));
      try {
        const res = await fetch(`/api/admin/seo/audit/status?id=${watching}`, { credentials: "same-origin", cache: "no-store" });
        if (res.status === 404 || res.status === 401 || res.status === 403) {
          stop = true;
          setWatching(null);
          router.refresh();
          return;
        }
        const data = (await res.json()) as { ok: boolean; run?: AuditRun };
        if (data.ok && data.run && data.run.status === "running" && Date.now() - new Date(data.run.startedAt).getTime() > 10 * 60 * 1000) {
          stop = true;
          setWatching(null);
          toast({ kind: "error", title: "Audit did not finish", body: "The crawl was cut off after ten minutes. Run it again." });
          router.refresh();
          return;
        }
        if (data.ok && data.run && data.run.status !== "running") {
          stop = true;
          setWatching(null);
          toast(data.run.status === "finished" ? { kind: "success", title: "Audit finished", body: `${data.run.summary?.findings ?? 0} findings on ${data.run.routesScanned ?? 0} pages.` } : { kind: "error", title: "Audit failed", body: data.run.error ?? "Unknown error" });
          router.refresh();
          return;
        }
      } catch {
        // Keep polling; the next tick may succeed.
      }
      if (!stop) setTimeout(tick, 3000);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [watching, router, toast]);

  async function run() {
    setPending(true);
    const res = await apiPost<{ id: string }>("/api/admin/seo/audit/run", {}, csrf);
    setPending(false);
    if (res.data.ok) {
      setWatching(res.data.id);
      setSeconds(0);
      toast({ kind: "info", title: "Audit started", body: "Crawling the public site. This takes a minute or two." });
      router.refresh();
    } else toast({ kind: "error", title: "Not started", body: res.data.error === "already_running" ? "A crawl is already running." : describeError(res.status, res.data.error) });
  }

  return (
    <Card
      title="Run an audit"
      description="Crawls the public site from the home page, follows every internal link, then visits the routes nobody links to."
      actions={canWrite ? <Button size="sm" onClick={run} disabled={pending || !!watching}>{pending ? "Starting" : watching ? "Crawling" : "Run audit now"}</Button> : undefined}
      className="adm-card"
    >
      {watching && <Alert kind="info" live={false}>Crawling, {seconds} seconds so far. The results appear here when it finishes.</Alert>}
    </Card>
  );
}
