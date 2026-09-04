"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventRow } from "@/lib/admin/security";
import type { SecurityRetention } from "@/lib/schemas/security";
import type { TableParams } from "@/app/(admin)/_lib/table";
import { apiPost, describeError } from "../api-client";
import { Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { DataTable, TableFilters, type Column } from "../ui/DataTable";
import { Input } from "../ui/Field";
import { useToast } from "../ui/Toast";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });

// Which events read as a problem, a refusal, or ordinary activity.
const TONE: Record<string, "danger" | "warn" | "ok" | "muted" | "info"> = {
  login_failed: "danger",
  login_locked: "danger",
  mfa_failed: "danger",
  permission_denied: "danger",
  csrf_rejected: "danger",
  account_locked: "danger",
  ip_blocked: "danger",
  rate_limited: "warn",
  honeypot: "warn",
  captcha_rejected: "warn",
  upload_rejected: "warn",
  invite_rejected: "warn",
  login_success: "ok",
  mfa_success: "ok",
  mfa_enrolled: "ok",
  invite_redeemed: "ok",
  account_unlocked: "ok",
};

function metaText(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

export function EventsList({
  params,
  rows,
  total,
  types,
  exportHref,
  csrf,
  retention,
}: {
  params: TableParams;
  rows: EventRow[];
  total: number;
  types: { value: string; label: string; n: number }[];
  exportHref: string;
  csrf: string;
  retention: SecurityRetention;
}) {
  const columns: Column<EventRow>[] = [
    { key: "createdAt", label: "When", sortable: true, render: (r) => <span className="adm-mono">{fmt(r.createdAt)}</span> },
    { key: "type", label: "Event", sortable: true, render: (r) => <Badge tone={TONE[r.type] ?? "muted"}>{r.type.replace(/_/g, " ")}</Badge> },
    { key: "email", label: "Account", sortable: true, render: (r) => r.email ?? <span className="adm-muted">none</span> },
    { key: "path", label: "Path", render: (r) => (r.path ? <span className="adm-seo-path">{r.path}</span> : <span className="adm-muted">none</span>) },
    { key: "ipHash", label: "IP hash", render: (r) => (r.ipHash ? <span className="adm-mono" title="Addresses are stored only as a salted hash">{r.ipHash.slice(0, 12)}</span> : <span className="adm-muted">none</span>) },
    { key: "meta", label: "Detail", render: (r) => <span className="adm-finding-detail">{metaText(r.meta)}</span> },
  ];

  return (
    <>
      <DataTable
        basePath="/admin/security/events"
        params={params}
        total={total}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="Security events, newest first"
        empty={<p className="adm-muted" style={{ margin: 0 }}>No events match. Sign-ins, refusals and abuse rejections appear here as they happen.</p>}
        toolbar={
          <TableFilters
            basePath="/admin/security/events"
            params={params}
            searchLabel="Search events"
            filters={[{ key: "type", label: "Event type", options: types.map((t) => ({ value: t.value, label: `${t.label} (${t.n})` })) }]}
          >
            <div className="adm-field">
              <label className="adm-label" htmlFor="ev-from">From</label>
              <input id="ev-from" className="adm-input" type="date" name="from" defaultValue={params.filters.from ?? ""} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="ev-to">To</label>
              <input id="ev-to" className="adm-input" type="date" name="to" defaultValue={params.filters.to ?? ""} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="ev-email">Account</label>
              <input id="ev-email" className="adm-input" type="search" name="email" defaultValue={params.filters.email ?? ""} />
            </div>
            <div className="adm-actions">
              <a className="adm-btn adm-btn-ghost adm-btn-sm" href={exportHref}>Export CSV</a>
            </div>
          </TableFilters>
        }
      />
      <RetentionForm csrf={csrf} initial={retention} />
    </>
  );
}

function RetentionForm({ csrf, initial }: { csrf: string; initial: SecurityRetention }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(String(initial.eventDays));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== String(initial.eventDays);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d+$/.test(value.trim())) {
      setError("Enter a whole number of days (0 keeps events forever)");
      return;
    }
    setPending(true);
    setError(null);
    const res = await apiPost("/api/admin/security/retention", { eventDays: Number(value) }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Retention saved", body: "Applied by the next cron run." });
      router.refresh();
    } else toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
  }

  return (
    <Card title="Retention" description="How long security events are kept. The append-only audit log is separate and is never deleted." className="adm-card" >
      <form className="adm-form adm-inline-form" onSubmit={save} noValidate>
        <Input id="sec-retention" label="Keep events for (days)" type="number" min={0} max={3650} step={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} error={error} help="0 keeps them forever. Default 180." disabled={pending} />
        <div className="adm-actions">
          <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save retention"}</Button>
        </div>
      </form>
    </Card>
  );
}
