import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { DataTable, TableFilters, type Column } from "@/app/(admin)/_components/ui/DataTable";
import { Checkbox } from "@/app/(admin)/_components/ui/Field";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { auditFilterOptions, diffEntries, fetchAudit, parseAuditParams, type AuditRow } from "@/app/(admin)/_lib/audit-query";
import { tableHref } from "@/app/(admin)/_lib/table";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Audit log" };

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/audit", { permission: "audit:read" });
  const params = parseAuditParams(await searchParams);
  const [{ rows, total }, options] = await Promise.all([fetchAudit(params, user.id), auditFilterOptions()]);
  const exportHref = tableHref("/api/admin/audit/export", params, { page: 1 }, { sort: "createdAt", dir: "desc" });

  const columns: Column<AuditRow>[] = [
    { key: "createdAt", label: "When", sortable: true, render: (r) => <time dateTime={r.createdAt.toISOString()}>{fmt(r.createdAt)}</time> },
    { key: "actorEmail", label: "Actor", sortable: true, render: (r) => r.actorEmail ?? <span className="adm-muted">system</span> },
    { key: "action", label: "Action", sortable: true, render: (r) => <span className="adm-mono">{r.action}</span> },
    {
      key: "entityType",
      label: "Entity",
      sortable: true,
      render: (r) => (
        <span>
          <Badge tone="muted">{r.entityType}</Badge>
          {r.entityId && <span className="adm-mono" style={{ marginInlineStart: 8 }}>{r.entityId.slice(0, 8)}</span>}
        </span>
      ),
    },
    {
      key: "diff",
      label: "Change",
      render: (r) => {
        const entries = diffEntries(r.before, r.after);
        if (entries.length === 0) return <span className="adm-muted">No field changes recorded</span>;
        return (
          <details className="adm-details">
            <summary>{entries.length} field{entries.length === 1 ? "" : "s"} changed</summary>
            <div className="adm-diff">
              {entries.map((e) => (
                <div key={e.key}>
                  <strong>{e.key}</strong>: {e.before !== null && <del>{e.before}</del>} {e.before !== null && e.after !== null && "→ "}
                  {e.after !== null && <ins>{e.after}</ins>}
                </div>
              ))}
            </div>
          </details>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Administration"
        title="Audit log"
        description="Every mutation, who made it, and the before and after values. Append only: no role can edit or delete an entry."
        actions={
          <a className="adm-btn adm-btn-ghost adm-btn-sm" href={exportHref}>
            <Icon name="download" size={18} /> Export CSV
          </a>
        }
      />
      <DataTable
        basePath="/admin/audit"
        params={params}
        total={total}
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        caption="Audit log entries"
        toolbar={
          <TableFilters
            basePath="/admin/audit"
            params={params}
            searchLabel="Search action, entity or actor"
            filters={[
              { key: "action", label: "Action", options: options.actions.map((v) => ({ value: v, label: v })) },
              { key: "actor", label: "Actor", options: options.actors.map((v) => ({ value: v, label: v })) },
              { key: "entity", label: "Entity", options: options.entities.map((v) => ({ value: v, label: v })) },
            ]}
          >
            <div className="adm-field">
              <label className="adm-label" htmlFor="audit-from">From</label>
              <input id="audit-from" className="adm-input" type="date" name="from" defaultValue={params.filters.from ?? ""} />
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="audit-to">To</label>
              <input id="audit-to" className="adm-input" type="date" name="to" defaultValue={params.filters.to ?? ""} />
            </div>
            <Checkbox id="audit-mine" name="mine" value="1" label="Only my actions" defaultChecked={params.filters.mine === "1"} />
          </TableFilters>
        }
        empty={
          <EmptyState
            icon="audit"
            title={total === 0 && !params.q && Object.keys(params.filters).length === 0 ? "Nothing recorded yet" : "No entries match these filters"}
            body={total === 0 && !params.q && Object.keys(params.filters).length === 0 ? "Entries appear here as soon as anyone changes something in the console." : "Try a wider date range or clear the filters."}
          />
        }
      />
    </>
  );
}
