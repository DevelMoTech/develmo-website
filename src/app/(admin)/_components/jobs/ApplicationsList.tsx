import Link from "next/link";
import type { ApplicationListRow } from "../../_lib/applications-query";
import type { TableParams } from "../../_lib/table";
import { Badge, EmptyState } from "../ui/Basics";
import { DataTable, TableFilters, type Column } from "../ui/DataTable";
import { Icon } from "../ui/Icon";
import { STAGES } from "@/lib/schemas/job";

export const STAGE_TONE = { new: "info", screening: "muted", interview: "warn", offer: "ok", hired: "ok", rejected: "danger" } as const;

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="adm-muted">unrated</span>;
  return (
    <span className="adm-stars" aria-label={`${rating} of 5`}>
      {"★".repeat(rating)}
      <span className="adm-stars-off">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// Server-rendered pipeline table shared by /admin/applications and
// /admin/jobs/[id]/applications; every state lives in the URL.
export function ApplicationsList({
  basePath,
  params,
  rows,
  total,
  showJob,
  jobs,
  staff,
  exportHref,
}: {
  basePath: string;
  params: TableParams;
  rows: ApplicationListRow[];
  total: number;
  showJob: boolean;
  jobs?: { id: string; title: string }[];
  staff: { id: string; name: string }[];
  exportHref: string;
}) {
  const columns: Column<ApplicationListRow>[] = [
    {
      key: "name",
      label: "Applicant",
      sortable: true,
      render: (r) => (
        <div>
          <Link href={`/admin/applications/${r.id}`} className="adm-rowlink">{r.name}</Link>
          <div className="adm-help">{r.email}{r.location ? ` · ${r.location}` : ""}</div>
        </div>
      ),
    },
    ...(showJob ? [{ key: "job", label: "Role", sortable: true, render: (r: ApplicationListRow) => <Link href={`/admin/jobs/${r.jobId}/applications`} className="adm-link">{r.jobTitle}</Link> }] : []),
    { key: "stage", label: "Stage", sortable: true, render: (r) => <Badge tone={STAGE_TONE[r.stage]}>{r.stage}</Badge> },
    { key: "rating", label: "Rating", sortable: true, render: (r) => <Stars rating={r.rating} /> },
    { key: "assignee", label: "Assigned to", render: (r) => r.assigneeName ?? <span className="adm-muted">nobody</span> },
    { key: "createdAt", label: "Submitted", sortable: true, render: (r) => fmt(r.createdAt) },
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
      caption="Applications"
      toolbar={
        <TableFilters
          basePath={basePath}
          params={params}
          searchLabel="Search name, email, location or role"
          filters={[
            { key: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: s })) },
            ...(jobs && jobs.length ? [{ key: "job", label: "Role", options: jobs.map((j) => ({ value: j.id, label: j.title })) }] : []),
            { key: "assignee", label: "Assigned to", options: [{ value: "me", label: "Me" }, { value: "none", label: "Nobody" }, ...staff.map((s) => ({ value: s.id, label: s.name }))] },
          ]}
        >
          <a className="adm-btn adm-btn-ghost adm-btn-sm" href={exportHref}>
            <Icon name="download" size={18} /> Export CSV
          </a>
        </TableFilters>
      }
      empty={<EmptyState icon="applications" title={total === 0 && !filtered ? "No applications yet" : "No applications match"} body={total === 0 && !filtered ? "Applications submitted on the careers page land here with the CV attached." : "Try another search or clear the filters."} />}
    />
  );
}
