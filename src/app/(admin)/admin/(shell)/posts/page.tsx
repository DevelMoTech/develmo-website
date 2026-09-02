import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { BulkForm, RowCheckbox } from "@/app/(admin)/_components/posts/BulkActions";
import { Badge, EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { DataTable, TableFilters, type Column } from "@/app/(admin)/_components/ui/DataTable";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { parseTableParams } from "@/app/(admin)/_lib/table";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Posts" };

const TABLE = {
  sortKeys: ["title", "status", "type", "publishedAt", "updatedAt"] as const,
  defaultSort: "updatedAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["status", "type", "tag"] as const,
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

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/posts", { permission: "content:read" });
  const canWrite = can(user.role, "content:write");
  const csrf = await getCsrfToken();
  const params = parseTableParams(await searchParams, TABLE);
  const clauses: SQL[] = [];
  if (params.filters.status && ["draft", "scheduled", "published", "archived"].includes(params.filters.status)) clauses.push(eq(posts.status, params.filters.status as Row["status"]));
  if (params.filters.type && ["blog", "kb"].includes(params.filters.type)) clauses.push(eq(posts.type, params.filters.type as Row["type"]));
  if (params.filters.tag) clauses.push(sql`${params.filters.tag.toLowerCase()} = any(${posts.tags})`);
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(posts.title, needle), ilike(posts.slug, needle), ilike(posts.category, needle))!);
  }
  const where = clauses.length ? and(...clauses) : undefined;
  const col = SORT[params.sort as keyof typeof SORT];
  const db = getDb();
  const [rows, totalRow, tagRows] = await Promise.all([
    db.select().from(posts).where(where).orderBy(params.dir === "asc" ? asc(col) : desc(col)).limit(params.pageSize).offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(posts).where(where),
    db.execute<{ tag: string }>(sql`select distinct unnest(${posts.tags}) as tag from ${posts} order by tag`),
  ]);
  const total = totalRow[0]?.n ?? 0;
  const tags = (tagRows.rows as { tag: string }[]).map((r) => r.tag);

  const columns: Column<Row>[] = [
    ...(canWrite ? [{ key: "select", label: "Select", actions: true, className: "adm-col-check", render: (r: Row) => <RowCheckbox id={r.id} label={r.title} /> }] : []),
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (r) => (
        <div>
          <Link href={`/admin/posts/${r.id}`} className="adm-rowlink">{r.title}</Link>
          <div className="adm-help adm-mono">/{r.type === "kb" ? "our-knowledge-base" : "our-blogs"}/{r.slug}</div>
        </div>
      ),
    },
    { key: "type", label: "Type", sortable: true, render: (r) => <Badge tone="muted">{r.type}</Badge> },
    { key: "status", label: "Status", sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: "tags", label: "Tags", render: (r) => (r.tags.length ? r.tags.join(", ") : <span className="adm-muted">none</span>) },
    { key: "publishedAt", label: "Published", sortable: true, render: (r) => fmt(r.publishedAt) || <span className="adm-muted">not yet</span> },
    { key: "updatedAt", label: "Updated", sortable: true, render: (r) => fmt(r.updatedAt) },
  ];

  const filtered = Boolean(params.q) || Object.keys(params.filters).length > 0;
  const table = (
    <DataTable
      basePath="/admin/posts"
      params={params}
      total={total}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Posts"
      empty={
        <EmptyState
          icon="posts"
          title={total === 0 && !filtered ? "No posts yet" : "No posts match"}
          body={total === 0 && !filtered ? "Write the first article. It goes live on the blog or knowledge base without a deploy." : "Try another search or clear the filters."}
          action={canWrite && !filtered ? <ButtonLink href="/admin/posts/new" variant="primary"><Icon name="plus" size={18} /> New post</ButtonLink> : undefined}
        />
      }
    />
  );

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Posts"
        description="Blog and knowledge base articles served to the public site from the database."
        actions={canWrite ? <ButtonLink href="/admin/posts/new" variant="primary"><Icon name="plus" size={18} /> New post</ButtonLink> : undefined}
      />
      <TableFilters
        basePath="/admin/posts"
        params={params}
        searchLabel="Search title, slug or category"
        filters={[
          { key: "status", label: "Status", options: ["draft", "scheduled", "published", "archived"].map((v) => ({ value: v, label: v })) },
          { key: "type", label: "Type", options: [{ value: "blog", label: "Blog" }, { value: "kb", label: "Knowledge base" }] },
          ...(tags.length ? [{ key: "tag", label: "Tag", options: tags.map((t) => ({ value: t, label: t })) }] : []),
        ]}
      />
      {canWrite ? <BulkForm csrf={csrf} total={rows.length}>{table}</BulkForm> : table}
    </>
  );
}
