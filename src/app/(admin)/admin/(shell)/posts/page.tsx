import type { Metadata } from "next";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { Badge, EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { DataTable, TableFilters, type Column } from "@/app/(admin)/_components/ui/DataTable";
import { parseTableParams } from "@/app/(admin)/_lib/table";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Posts" };

const TABLE = {
  sortKeys: ["title", "status", "type", "publishedAt", "updatedAt"] as const,
  defaultSort: "updatedAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["status", "type"] as const,
};

type Row = typeof posts.$inferSelect;

const SORT = {
  title: posts.title,
  status: posts.status,
  type: posts.type,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
} as const;

const STATUS_TONE = { published: "ok", draft: "muted", scheduled: "info", archived: "warn" } as const;

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

// Read-only listing of every post in the database (the editor arrives in the
// posts phase). Sorting, filtering and paging all live in the URL.
export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("/admin/posts", { permission: "content:read" });
  const params = parseTableParams(await searchParams, TABLE);
  const clauses: SQL[] = [];
  if (params.filters.status && ["draft", "scheduled", "published", "archived"].includes(params.filters.status)) clauses.push(eq(posts.status, params.filters.status as Row["status"]));
  if (params.filters.type && ["blog", "kb"].includes(params.filters.type)) clauses.push(eq(posts.type, params.filters.type as Row["type"]));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(posts.title, needle), ilike(posts.slug, needle), ilike(posts.category, needle))!);
  }
  const where = clauses.length ? and(...clauses) : undefined;
  const col = SORT[params.sort as keyof typeof SORT];
  const db = getDb();
  const [rows, totalRow] = await Promise.all([
    db.select().from(posts).where(where).orderBy(params.dir === "asc" ? asc(col) : desc(col)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(posts).where(where),
  ]);
  const total = totalRow[0]?.n ?? 0;

  const columns: Column<Row>[] = [
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700 }}>{r.title}</div>
          <div className="adm-help adm-mono">/{r.type === "kb" ? "our-knowledge-base" : "our-blogs"}/{r.slug}</div>
        </div>
      ),
    },
    { key: "type", label: "Type", sortable: true, render: (r) => <Badge tone="muted">{r.type}</Badge> },
    { key: "status", label: "Status", sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: "publishedAt", label: "Published", sortable: true, render: (r) => fmt(r.publishedAt) || <span className="adm-muted">not yet</span> },
    { key: "updatedAt", label: "Updated", sortable: true, render: (r) => fmt(r.updatedAt) },
  ];

  return (
    <>
      <PageHeader kicker="Content" title="Posts" description="Blog and knowledge base articles served to the public site from the database. Editing tools follow in the posts phase." />
      <DataTable
        basePath="/admin/posts"
        params={params}
        total={total}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="Posts"
        toolbar={
          <TableFilters
            basePath="/admin/posts"
            params={params}
            searchLabel="Search title, slug or category"
            filters={[
              { key: "status", label: "Status", options: ["draft", "scheduled", "published", "archived"].map((v) => ({ value: v, label: v })) },
              { key: "type", label: "Type", options: [{ value: "blog", label: "Blog" }, { value: "kb", label: "Knowledge base" }] },
            ]}
          />
        }
        empty={<EmptyState icon="posts" title={total === 0 && !params.q && !Object.keys(params.filters).length ? "No posts yet" : "No posts match"} body={total === 0 ? "Posts written in the console are published to the blog and knowledge base without a deploy." : "Try another search or clear the filters."} />}
      />
    </>
  );
}
