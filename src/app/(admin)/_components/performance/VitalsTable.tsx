import Link from "next/link";
import type { VitalsRouteRow } from "@/lib/admin/performance";
import { formatMetric, METRICS, rate, THRESHOLDS, type MetricName } from "@/lib/perf/vitals";
import { Badge } from "../ui/Basics";
import { TableFrame } from "../ui/TableFrame";

const TONE = { good: "ok", "needs-improvement": "warn", poor: "danger" } as const;

function Cell({ metric, p75, samples }: { metric: MetricName; p75: number | null; samples: number }) {
  if (p75 === null || samples === 0) return <span className="adm-muted">no data</span>;
  return (
    <span title={`${samples.toLocaleString("en-GB")} sample${samples === 1 ? "" : "s"}`}>
      <Badge tone={TONE[rate(metric, p75)]}>{formatMetric(metric, p75)}</Badge>
    </span>
  );
}

// p75 per route per metric, split by device class (brief §3.8). Server
// rendered: the window is a link, so the state is the URL.
export function VitalsTable({ rows, days }: { rows: VitalsRouteRow[]; days: number }) {
  return (
    <>
      <div className="adm-chips" role="navigation" aria-label="Window" style={{ marginBlock: 14 }}>
        {[7, 28].map((d) => (
          <Link key={d} className={`adm-btn adm-btn-sm ${days === d ? "adm-btn-primary" : "adm-btn-ghost"}`} href={d === 7 ? "/admin/performance" : `/admin/performance?days=${d}`} aria-current={days === d ? "page" : undefined}>
            Last {d} days
          </Link>
        ))}
      </div>
      <TableFrame>
        <div className="adm-table-wrap" tabIndex={0}>
          <table className="adm-table">
            <caption className="adm-sr">75th percentile Core Web Vitals per route and device class</caption>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Device</th>
                {METRICS.map((m) => (
                  <th key={m} scope="col" title={`Good at or below ${formatMetric(m, THRESHOLDS[m].good)}, poor above ${formatMetric(m, THRESHOLDS[m].poor)}`}>
                    {m}
                  </th>
                ))}
                <th scope="col">Samples</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((r) =>
                (["mobile", "desktop"] as const)
                  .filter((d) => METRICS.some((m) => r.metrics[m][d].samples > 0))
                  .map((d) => (
                    <tr key={`${r.route}-${d}`}>
                      <td data-label="Route"><span className="adm-seo-path">{r.route}</span></td>
                      <td data-label="Device">{d}</td>
                      {METRICS.map((m) => (
                        <td key={m} data-label={m}>
                          <Cell metric={m} p75={r.metrics[m][d].p75} samples={r.metrics[m][d].samples} />
                        </td>
                      ))}
                      <td data-label="Samples">{METRICS.reduce((n, m) => n + r.metrics[m][d].samples, 0).toLocaleString("en-GB")}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </div>
      </TableFrame>
      <p className="adm-help">
        p75 means three quarters of measured visits were at least this good. Thresholds are Google&apos;s published ones. A route with few samples is
        noisy: treat anything under a hundred as indicative rather than settled.
      </p>
    </>
  );
}
