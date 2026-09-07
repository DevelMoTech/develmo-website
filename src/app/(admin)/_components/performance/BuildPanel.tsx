"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildView } from "@/lib/admin/performance";
import { formatBytes } from "@/lib/perf/bundle";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

function Delta({ bytes }: { bytes: number }) {
  if (bytes === 0) return <span className="adm-muted">no change</span>;
  return <span className={bytes > 0 ? "adm-delta-up" : "adm-delta-down"}>{bytes > 0 ? "+" : ""}{formatBytes(bytes)}</span>;
}

export function BuildPanel({ view, csrf, canRecord }: { view: BuildView; csrf: string; canRecord: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const current = view.current;
  const file = view.fromFile;
  const publicRoutes = (current?.routes ?? []).filter((r) => !r.route.startsWith("/admin") && !r.route.startsWith("/api"));
  const shown = showAll ? current?.routes ?? [] : publicRoutes;

  async function record() {
    setPending(true);
    const res = await apiPost<{ routes: number; detail?: string }>("/api/admin/performance/build", {}, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Build recorded", body: `${res.data.routes} routes. The next build is compared against this one.` });
      router.refresh();
      return;
    }
    const raw = res.data as { detail?: string };
    toast({ kind: "error", title: "Not recorded", body: raw.detail ?? describeError(res.status, res.data.error) });
  }

  return (
    <>
      <Card
        title={current ? `Recorded build ${current.buildId ?? "unknown"}` : "No build recorded yet"}
        description={current ? `Stored ${fmt(view.recordedAt)}. Shared client runtime ${formatBytes(current.sharedBytes)}, all client JS ${formatBytes(current.totalClientBytes)}.` : "This deployment carries a build stats file; record it to start tracking sizes across builds."}
        actions={canRecord ? <Button size="sm" onClick={record} disabled={pending}>{pending ? "Recording" : "Record this build"}</Button> : undefined}
      >
        {file && current && file.buildId === current.buildId && <Alert kind="info" live={false}>This deployment&apos;s build is the one recorded.</Alert>}
        {file && current && file.buildId !== current.buildId && <Alert kind="warn" live={false}>This deployment is build {file.buildId ?? "unknown"}, which is newer than the recorded one. Record it to compare.</Alert>}
        {!file && <Alert kind="warn" live={false}>No build stats file was found on this deployment. It is written by the postbuild script after every build.</Alert>}
      </Card>

      {view.delta && (
        <Card title="Change since the previous recorded build" description={`Shared runtime ${view.delta.sharedBytes === 0 ? "unchanged" : formatBytes(view.delta.sharedBytes)}, all client JS ${view.delta.totalClientBytes === 0 ? "unchanged" : formatBytes(view.delta.totalClientBytes)}.`}>
          {view.delta.routes.length === 0 && view.delta.added.length === 0 && view.delta.removed.length === 0 ? (
            <p className="adm-muted" style={{ margin: 0 }}>No route changed size.</p>
          ) : (
            <>
              {view.delta.added.length > 0 && <p className="adm-help">New routes: {view.delta.added.join(", ")}</p>}
              {view.delta.removed.length > 0 && <p className="adm-help">Removed routes: {view.delta.removed.join(", ")}</p>}
              <TableFrame>
                <div className="adm-table-wrap" tabIndex={0}>
                  <table className="adm-table adm-table-plain">
                    <caption className="adm-sr">Routes whose client JS changed</caption>
                    <thead>
                      <tr><th scope="col">Route</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th></tr>
                    </thead>
                    <tbody>
                      {view.delta.routes.slice(0, 20).map((r) => (
                        <tr key={r.route}>
                          <td data-label="Route"><span className="adm-seo-path">{r.route}</span></td>
                          <td data-label="Before">{r.before === null ? "new" : formatBytes(r.before)}</td>
                          <td data-label="After">{r.after === null ? "gone" : formatBytes(r.after)}</td>
                          <td data-label="Change"><Delta bytes={r.delta} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableFrame>
            </>
          )}
        </Card>
      )}

      {current && (
        <>
          <div className="adm-chips" style={{ marginBlock: 14 }}>
            <Button size="sm" variant={showAll ? "ghost" : "primary"} onClick={() => setShowAll(false)}>Public routes ({publicRoutes.length})</Button>
            <Button size="sm" variant={showAll ? "primary" : "ghost"} onClick={() => setShowAll(true)}>Every route ({current.routes.length})</Button>
          </div>
          <TableFrame>
            <div className="adm-table-wrap" tabIndex={0}>
              <table className="adm-table">
                <caption className="adm-sr">Client JavaScript per route</caption>
                <thead>
                  <tr><th scope="col">Route</th><th scope="col">First load JS</th><th scope="col">Beyond the shared runtime</th><th scope="col">Chunks</th></tr>
                </thead>
                <tbody>
                  {shown.slice(0, 60).map((r) => (
                    <tr key={r.route}>
                      <td data-label="Route"><span className="adm-seo-path">{r.route}</span></td>
                      <td data-label="First load JS">{formatBytes(r.firstLoadBytes)}</td>
                      <td data-label="Beyond the shared runtime">{formatBytes(r.ownBytes)}</td>
                      <td data-label="Chunks">{r.chunkCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>

          <Card title="Largest client chunks" description="Every route that uses a chunk pays for it once; the browser then caches it across the site.">
            <TableFrame>
              <div className="adm-table-wrap" tabIndex={0}>
                <table className="adm-table adm-table-plain">
                  <caption className="adm-sr">The largest client chunks in this build</caption>
                  <thead>
                    <tr><th scope="col">Chunk</th><th scope="col">Size</th><th scope="col">Used by</th></tr>
                  </thead>
                  <tbody>
                    {current.chunks.slice(0, 15).map((c) => (
                      <tr key={c.file}>
                        <td data-label="Chunk"><span className="adm-mono adm-seo-path">{c.file}</span></td>
                        <td data-label="Size">{formatBytes(c.bytes)}</td>
                        <td data-label="Used by">{c.routes} route{c.routes === 1 ? "" : "s"}{c.routes === current.routes.length && <> <Badge tone="info">every route</Badge></>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableFrame>
          </Card>

          <p className="adm-help">
            Sizes are uncompressed bytes on disk, read from the build&apos;s own manifests, not an estimate. First load JS is the total of every client
            chunk that route&apos;s modules reference, including the shared runtime; a chunk shared by several routes is counted in each of them, though
            a visitor downloads it once and the browser caches it. Compare routes against each other rather than against a published benchmark.
          </p>
        </>
      )}
    </>
  );
}
