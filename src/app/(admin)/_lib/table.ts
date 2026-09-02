import { z } from "zod";

// URL-backed list state (brief §2: page, sort, filter and query live in
// searchParams so every list view is linkable and back-button safe). Parsed
// with zod at the boundary (§7.8).

export type SortDir = "asc" | "desc";

export type TableParams = {
  page: number;
  pageSize: number;
  sort: string;
  dir: SortDir;
  q: string;
  filters: Record<string, string>;
};

export type TableOptions = {
  sortKeys: readonly string[];
  defaultSort: string;
  defaultDir?: SortDir;
  pageSize?: number;
  filterKeys?: readonly string[];
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseTableParams(sp: RawSearchParams, opts: TableOptions): TableParams {
  const schema = z.object({
    page: z.coerce.number().int().min(1).max(100_000).catch(1),
    sort: z.enum(opts.sortKeys as [string, ...string[]]).catch(opts.defaultSort),
    dir: z.enum(["asc", "desc"]).catch(opts.defaultDir ?? "desc"),
    q: z.string().trim().max(200).catch(""),
  });
  const parsed = schema.parse({ page: first(sp.page), sort: first(sp.sort), dir: first(sp.dir), q: first(sp.q) });
  const filters: Record<string, string> = {};
  for (const key of opts.filterKeys ?? []) {
    const v = z.string().trim().max(200).catch("").parse(first(sp[key]) ?? "");
    if (v) filters[key] = v;
  }
  return { ...parsed, pageSize: opts.pageSize ?? 25, filters };
}

// Builds a URL for the same list with some state changed. Defaults are
// omitted so canonical URLs stay short.
export function tableHref(
  basePath: string,
  params: TableParams,
  patch: Partial<Omit<TableParams, "filters">> & { filters?: Record<string, string> } = {},
  defaults: { sort: string; dir: SortDir } = { sort: params.sort, dir: params.dir },
): string {
  const next = { ...params, ...patch, filters: { ...params.filters, ...(patch.filters ?? {}) } };
  const sp = new URLSearchParams();
  if (next.page > 1) sp.set("page", String(next.page));
  if (next.sort !== defaults.sort || next.dir !== defaults.dir) {
    sp.set("sort", next.sort);
    sp.set("dir", next.dir);
  }
  if (next.q) sp.set("q", next.q);
  for (const [k, v] of Object.entries(next.filters)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// Compact page list: 1 ... 4 5 [6] 7 8 ... 20
export function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set<number>([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}
