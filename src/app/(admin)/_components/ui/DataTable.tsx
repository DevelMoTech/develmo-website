import Link from "next/link";
import type { ReactNode } from "react";
import { pageCount, pageWindow, tableHref, type TableParams } from "../../_lib/table";
import { Icon } from "./Icon";
import { TableFrame } from "./TableFrame";

export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  className?: string;
  // Marks the actions column so the stacked mobile layout hides its label.
  actions?: boolean;
};

export function Pagination({ basePath, params, total }: { basePath: string; params: TableParams; total: number }) {
  const count = pageCount(total, params.pageSize);
  if (count <= 1) return null;
  const items = pageWindow(params.page, count);
  return (
    <nav aria-label="Pagination">
      <ul className="adm-pages">
        <li>
          {params.page > 1 ? (
            <Link href={tableHref(basePath, params, { page: params.page - 1 })} aria-label="Previous page"><Icon name="chevronLeft" size={18} /></Link>
          ) : (
            <span className="adm-pages-off" aria-hidden="true"><Icon name="chevronLeft" size={18} /></span>
          )}
        </li>
        {items.map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`}><span className="adm-pages-off" aria-hidden="true">…</span></li>
          ) : (
            <li key={p}>
              {p === params.page ? (
                <span aria-current="page">{p}</span>
              ) : (
                <Link href={tableHref(basePath, params, { page: p })} aria-label={`Page ${p}`}>{p}</Link>
              )}
            </li>
          ),
        )}
        <li>
          {params.page < count ? (
            <Link href={tableHref(basePath, params, { page: params.page + 1 })} aria-label="Next page"><Icon name="chevronRight" size={18} /></Link>
          ) : (
            <span className="adm-pages-off" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>
          )}
        </li>
      </ul>
    </nav>
  );
}

// Server-rendered data table. Sorting and paging are plain links, filtering
// is a GET form, so everything works without JavaScript and every state is a
// URL. Collapses to stacked cards below 768px (CSS, via data-label).
export function DataTable<T>({
  basePath,
  params,
  total,
  columns,
  rows,
  rowKey,
  caption,
  empty,
  toolbar,
  expand,
}: {
  basePath: string;
  params: TableParams;
  total: number;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty: ReactNode;
  toolbar?: ReactNode;
  // Optional expandable detail rendered under each row.
  expand?: (row: T) => ReactNode;
}) {
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const to = Math.min(total, params.page * params.pageSize);
  return (
    <div>
      {toolbar}
      {rows.length === 0 ? (
        <div className="adm-card">{empty}</div>
      ) : (
        <TableFrame>
          <div className="adm-table-wrap" tabIndex={0}>
            <table className="adm-table">
              <caption className="adm-sr">{caption}</caption>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = params.sort === c.key;
                    const nextDir = active && params.dir === "asc" ? "desc" : "asc";
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined} className={c.className}>
                        {c.sortable ? (
                          <Link href={tableHref(basePath, params, { sort: c.key, dir: active ? nextDir : "asc", page: 1 })}>
                            {c.label}
                            <Icon name={active ? (params.dir === "asc" ? "chevronUp" : "chevronDown") : "sort"} size={14} />
                          </Link>
                        ) : (
                          c.actions ? <span className="adm-sr">{c.label}</span> : c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)}>
                    {columns.map((c, i) => (
                      <td key={c.key} data-label={c.label} className={[c.className, c.actions && "adm-td-actions"].filter(Boolean).join(" ") || undefined}>
                        {c.render(row)}
                        {expand && i === columns.length - 1 && expand(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFrame>
      )}
      <div className="adm-table-foot">
        <span>{total === 0 ? "No results" : `Showing ${from} to ${to} of ${total}`}</span>
        <Pagination basePath={basePath} params={params} total={total} />
      </div>
    </div>
  );
}

// GET form for search and filters; sort state is carried in hidden fields.
export function TableFilters({
  basePath,
  params,
  filters,
  searchLabel = "Search",
  children,
}: {
  basePath: string;
  params: TableParams;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  searchLabel?: string;
  children?: ReactNode;
}) {
  const dirty = params.q || Object.keys(params.filters).length > 0;
  return (
    <form className="adm-toolbar" method="get" action={basePath} role="search" aria-label={searchLabel}>
      <input type="hidden" name="sort" value={params.sort} />
      <input type="hidden" name="dir" value={params.dir} />
      <div className="adm-field adm-field-q">
        <label className="adm-label" htmlFor="table-q">{searchLabel}</label>
        <input id="table-q" className="adm-input" type="search" name="q" defaultValue={params.q} />
      </div>
      {filters?.map((f) => (
        <div className="adm-field" key={f.key}>
          <label className="adm-label" htmlFor={`table-f-${f.key}`}>{f.label}</label>
          <select id={`table-f-${f.key}`} className="adm-input adm-select" name={f.key} defaultValue={params.filters[f.key] ?? ""}>
            <option value="">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ))}
      {children}
      <div className="adm-actions">
        <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm">Apply</button>
        {dirty && <Link className="adm-btn adm-btn-ghost adm-btn-sm" href={basePath}>Reset</Link>}
      </div>
    </form>
  );
}
