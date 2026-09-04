"use client";

import { useState } from "react";
import { dataCost, formatCost, formatDuration, isFlagged, totalsByKind, type AssetRow } from "@/lib/perf/assets";
import { formatBytes } from "@/lib/perf/bundle";
import { Alert, Badge, Card } from "../ui/Basics";
import { TableFrame } from "../ui/TableFrame";

const KIND_LABEL: Record<string, string> = { video: "Video", image: "Images", font: "Fonts", document: "Documents", other: "Other" };

export function AssetReport({ rows, note }: { rows: AssetRow[]; note: string | null }) {
  const [kind, setKind] = useState("");
  const flagged = rows.filter((r) => isFlagged(r.path));
  const flaggedBytes = flagged.reduce((n, r) => n + (r.transferBytes ?? r.bytes), 0);
  const cost = dataCost(flaggedBytes);
  const totals = totalsByKind(rows);
  const visible = kind ? rows.filter((r) => r.kind === kind) : rows;

  return (
    <>
      {flagged.length > 0 && (
        <Card
          title="Hero video weight"
          description="The home page hero plays three clips. This is what a visitor who watches the slider through one full cycle downloads."
        >
          <TableFrame>
            <div className="adm-table-wrap">
              <table className="adm-table adm-table-plain">
                <caption className="adm-sr">The three hero videos and their sizes</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Bytes</th>
                    <th scope="col">Size</th>
                    <th scope="col">Transfer</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((r) => (
                    <tr key={r.path}>
                      <td data-label="File"><span className="adm-mono">{r.path}</span></td>
                      <td data-label="Bytes"><span className="adm-mono">{r.bytes.toLocaleString("en-GB")}</span></td>
                      <td data-label="Size">{formatBytes(r.bytes)}</td>
                      <td data-label="Transfer">{r.transferBytes === null ? <span className="adm-muted">not measured</span> : `${formatBytes(r.transferBytes)}${r.encoding ? `, ${r.encoding}` : ""}`}</td>
                    </tr>
                  ))}
                  <tr>
                    <td data-label="File"><strong>All three</strong></td>
                    <td data-label="Bytes"><span className="adm-mono">{flaggedBytes.toLocaleString("en-GB")}</span></td>
                    <td data-label="Size"><strong>{formatBytes(flaggedBytes)}</strong></td>
                    <td data-label="Transfer"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TableFrame>
          <dl className="adm-dl">
            <dt>Mobile data</dt>
            <dd>{cost.megabytes.toFixed(2)} MB, about {formatCost(cost.gbp)} on a pay as you go tariff at 5p per MB, or {formatCost(cost.roamingGbp)} roaming at 50p per MB. Those rates are the assumption, not a measurement.</dd>
            <dt>Time to download</dt>
            <dd>{formatDuration(cost.secondsOnSlow4g)} on a slow 4G link at 1.6 Mbps, the profile Lighthouse throttles to.</dd>
            <dt>What can be done today</dt>
            <dd>The <a className="adm-link" href="/admin/performance/media">media settings</a> can hold the clips back on small screens or on touch devices, so those visitors get the poster image and download none of this.</dd>
          </dl>
        </Card>
      )}

      {note && <Alert kind="info" live={false}>{note}</Alert>}

      <div className="adm-toolbar" style={{ marginBlockStart: 18 }}>
        <div className="adm-field">
          <label className="adm-label" htmlFor="asset-kind">Type</label>
          <select id="asset-kind" className="adm-input adm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All ({rows.length})</option>
            {totals.map((t) => (
              <option key={t.kind} value={t.kind}>{KIND_LABEL[t.kind] ?? t.kind} ({t.count}, {formatBytes(t.bytes)})</option>
            ))}
          </select>
        </div>
      </div>

      <TableFrame>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="adm-sr">Every public asset, largest first</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Type</th>
                <th scope="col">Size</th>
                <th scope="col">Transfer</th>
                <th scope="col">Referenced by</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.source}-${r.path}`}>
                  <td data-label="File">
                    <span className="adm-mono adm-seo-path">{r.path}</span>
                    {isFlagged(r.path) && <div><Badge tone="warn">heavy</Badge></div>}
                    {r.source === "blob" && <div><Badge tone="muted">uploaded</Badge></div>}
                  </td>
                  <td data-label="Type"><span className="adm-mono">{r.contentType}</span></td>
                  <td data-label="Size">{formatBytes(r.bytes)}</td>
                  <td data-label="Transfer">{r.transferBytes === null ? <span className="adm-muted">not measured</span> : formatBytes(r.transferBytes)}</td>
                  <td data-label="Referenced by">
                    {r.routes.length === 0 ? (
                      <span className="adm-muted">{r.source === "blob" ? "used by content" : "no source reference found"}</span>
                    ) : (
                      <span className="adm-finding-detail">{r.routes.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableFrame>
      <div className="adm-table-foot"><span>{visible.length} of {rows.length} files</span></div>
      <p className="adm-help">
        Sizes are the bytes on disk. Transfer is what the server actually sent for the twenty largest, including any compression; video and image
        formats are already compressed, so the two usually match. References come from the last build, which scans the source for each path.
      </p>
    </>
  );
}
