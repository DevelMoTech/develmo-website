import Link from "next/link";
import type { SubmissionListRow } from "@/lib/admin/submissions";
import { SUBMISSION_STATUSES } from "@/lib/schemas/submission";
import type { TableParams } from "../../_lib/table";
import { Badge, EmptyState } from "../ui/Basics";
import { DataTable, TableFilters, type Column } from "../ui/DataTable";
import { Icon } from "../ui/Icon";
import { SpamRowActions } from "./SubmissionControls";

export const STATUS_TONE = { new: "info", read: "muted", in_progress: "warn", qualified: "ok", won: "ok", lost: "danger", spam: "danger" } as const;
export const DELIVERY_TONE = { pending: "muted", sent: "ok", failed: "danger", skipped: "muted" } as const;
export const STATUS_LABEL: Record<(typeof SUBMISSION_STATUSES)[number], string> = { new: "New", read: "Read", in_progress: "In progress", qualified: "Qualified", won: "Won", lost: "Lost", spam: "Spam" };

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function DeliveryBadge({ status, channel, kind }: { status: SubmissionListRow["deliveryStatus"]; channel: string | null; kind: SubmissionListRow["kind"] }) {
  if (kind !== "contact") return <span className="adm-muted">not applicable</span>;
  return (
    <Badge tone={DELIVERY_TONE[status]}>
      {status}
      {status === "sent" && channel ? ` via ${channel}` : ""}
    </Badge>
  );
}

// Server-rendered inbox table shared by /admin/submissions and the spam
// view; every filter, sort and page lives in the URL (brief §3.5).
export function SubmissionsList({
  basePath,
  params,
  rows,
  total,
  spam,
  staff,
  options,
  exportHref,
  csrf,
  canWrite,
}: {
  basePath: string;
  params: TableParams;
  rows: SubmissionListRow[];
  total: number;
  spam: boolean;
  staff: { id: string; name: string }[];
  options: { services: string[]; intents: string[]; industries: string[]; tags: string[] };
  exportHref: string;
  csrf: string;
  canWrite: boolean;
}) {
  const columns: Column<SubmissionListRow>[] = [
    {
      key: "name",
      label: "From",
      sortable: true,
      render: (r) => (
        <div>
          <Link href={`/admin/submissions/${r.id}`} className="adm-rowlink">{r.name || r.email || "(no name)"}</Link>
          <div className="adm-help">{[r.email, r.company].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    { key: "kind", label: "Kind", sortable: true, render: (r) => <Badge tone="muted">{r.kind}</Badge> },
    ...(spam
      ? [{ key: "spamReason", label: "Reason", render: (r: SubmissionListRow) => <Badge tone="danger">{r.spamReason ?? "manual"}</Badge> }]
      : [{ key: "status", label: "Status", sortable: true, render: (r: SubmissionListRow) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> }]),
    { key: "qualifiers", label: "Qualifiers", render: (r) => [r.service, r.intent, r.industry].filter(Boolean).join(" · ") || <span className="adm-muted">none</span> },
    { key: "assignee", label: "Assigned to", render: (r) => r.assigneeName ?? <span className="adm-muted">nobody</span> },
    { key: "delivery", label: "Delivery", sortable: true, render: (r) => <DeliveryBadge status={r.deliveryStatus} channel={r.deliveryChannel} kind={r.kind} /> },
    { key: "createdAt", label: "Received", sortable: true, render: (r) => fmt(r.createdAt) },
    ...(spam && canWrite ? [{ key: "actions", label: "Actions", actions: true, render: (r: SubmissionListRow) => <SpamRowActions csrf={csrf} id={r.id} label={r.email || r.name || r.id} /> }] : []),
  ];
  const filtered = Boolean(params.q) || Object.keys(params.filters).length > 0;
  return (
    <DataTable
      basePath={basePath}
      params={params}
      total={total}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption={spam ? "Spam" : "Submissions"}
      toolbar={
        <TableFilters
          basePath={basePath}
          params={params}
          searchLabel="Search name, email, company, phone or message"
          filters={[
            ...(spam ? [] : [{ key: "status", label: "Status", options: SUBMISSION_STATUSES.filter((s) => s !== "spam").map((s) => ({ value: s, label: STATUS_LABEL[s] })) }]),
            { key: "kind", label: "Kind", options: [{ value: "contact", label: "Contact" }, { value: "application", label: "Application" }, { value: "newsletter", label: "Newsletter" }] },
            { key: "assignee", label: "Assigned to", options: [{ value: "me", label: "Me" }, { value: "none", label: "Nobody" }, ...staff.map((s) => ({ value: s.id, label: s.name }))] },
            ...(options.services.length ? [{ key: "service", label: "Service", options: options.services.map((v) => ({ value: v, label: v })) }] : []),
            ...(options.intents.length ? [{ key: "intent", label: "Intent", options: options.intents.map((v) => ({ value: v, label: v })) }] : []),
            ...(options.industries.length ? [{ key: "industry", label: "Industry", options: options.industries.map((v) => ({ value: v, label: v })) }] : []),
            ...(options.tags.length ? [{ key: "tag", label: "Tag", options: options.tags.map((v) => ({ value: v, label: v })) }] : []),
            { key: "delivery", label: "Delivery", options: ["pending", "sent", "failed", "skipped"].map((v) => ({ value: v, label: v })) },
          ]}
        >
          <div className="adm-field">
            <label className="adm-label" htmlFor="table-from">From date</label>
            <input id="table-from" className="adm-input" type="date" name="from" defaultValue={params.filters.from ?? ""} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="table-to">To date</label>
            <input id="table-to" className="adm-input" type="date" name="to" defaultValue={params.filters.to ?? ""} />
          </div>
          <a className="adm-btn adm-btn-ghost adm-btn-sm" href={exportHref}>
            <Icon name="download" size={18} /> Export CSV
          </a>
        </TableFilters>
      }
      empty={
        <EmptyState
          icon="inbox"
          title={total === 0 && !filtered ? (spam ? "No spam held" : "No submissions yet") : "No submissions match"}
          body={total === 0 && !filtered ? (spam ? "Honeypot and captcha rejections land here instead of vanishing." : "Every enquiry from the contact form and every job application lands here, whether or not the email got through.") : "Try another search or clear the filters."}
        />
      }
    />
  );
}
