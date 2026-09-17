import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { RestoreButton } from "@/app/(admin)/_components/posts/RestoreButton";
import { Card, EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { changedCount, diffLines } from "@/app/(admin)/_lib/diff";
import { listRevisions, loadPost, type PostSnapshot } from "@/lib/admin/posts";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { TRANSLATION_LOCALES } from "@/lib/schemas/post";

export const metadata: Metadata = { title: "Revisions" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LABELS: Record<string, string> = {
  type: "Section",
  slug: "Slug",
  title: "Title",
  excerpt: "Excerpt",
  bodyMd: "Body",
  category: "Category",
  tags: "Tags",
  authorName: "Author",
  heroImageId: "Hero image",
  status: "Status",
  publishedAt: "Published at",
  canonicalOverride: "Canonical",
  metaTitle: "Meta title",
  metaDescription: "Meta description",
  ogImageId: "Sharing image",
  noindex: "Noindex",
};

function flatten(s: PostSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(FIELD_LABELS)) {
    const v = (s as unknown as Record<string, unknown>)[key];
    out[key] = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  }
  for (const locale of TRANSLATION_LOCALES) {
    const t = s.translations?.[locale];
    out[`${locale}.title`] = t?.title ?? "";
    out[`${locale}.excerpt`] = t?.excerpt ?? "";
    out[`${locale}.bodyMd`] = t?.bodyMd ?? "";
  }
  return out;
}

function label(key: string): string {
  const [locale, field] = key.split(".");
  if (field) return `${locale.toUpperCase()} ${FIELD_LABELS[field] ?? field}`;
  return FIELD_LABELS[key] ?? key;
}

function when(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

// Diff between any two revisions, one click restore (brief §3.3).
export default async function RevisionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { id } = await params;
  const { allows } = await requirePageUser(`/admin/posts/${id}/revisions`, { permission: "content:read" });
  if (!UUID.test(id)) notFound();
  const post = await loadPost(id);
  if (!post) notFound();
  const revisions = await listRevisions(id);
  const csrf = await getCsrfToken();
  const canWrite = allows("content:write");
  const sp = await searchParams;
  const byId = new Map(revisions.map((r) => [r.id, r]));
  // Default: the newest against the one before it.
  const a = (sp.a && byId.get(sp.a)) || revisions[1] || revisions[0];
  const b = (sp.b && byId.get(sp.b)) || revisions[0];
  const actorIds = [...new Set(revisions.map((r) => r.createdById).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await getDb().select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, actorIds)) : [];
  const actorName = (uid: string | null) => (uid ? (actors.find((u) => u.id === uid)?.name ?? "Removed user") : "Schedule");

  const fa = a ? flatten(a.snapshot as PostSnapshot) : null;
  const fb = b ? flatten(b.snapshot as PostSnapshot) : null;
  const changed = fa && fb ? Object.keys(fa).filter((k) => fa[k] !== fb[k]) : [];

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Revisions"
        description={
          <>
            {post.row.title}. Every save is kept. Pick two to compare, restore any of them.
          </>
        }
        actions={<ButtonLink href={`/admin/posts/${id}`}>Back to the editor</ButtonLink>}
      />
      <div className="adm-split">
        <Card title={`${revisions.length} revision${revisions.length === 1 ? "" : "s"}`}>
          {revisions.length === 0 ? (
            <EmptyState icon="history" title="No revisions yet" body="Save the post to create the first one." />
          ) : (
            <form method="get" action={`/admin/posts/${id}/revisions`} className="adm-revisions">
              <table className="adm-table adm-table-plain">
                <caption className="adm-sr">Revisions</caption>
                <thead>
                  <tr>
                    <th scope="col">A</th>
                    <th scope="col">B</th>
                    <th scope="col">When</th>
                    <th scope="col"><span className="adm-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((r, i) => (
                    <tr key={r.id}>
                      <td data-label="A"><label className="adm-rowcheck-hit"><input type="radio" name="a" value={r.id} defaultChecked={a?.id === r.id} aria-label={`Compare from ${when(r.createdAt)}`} /></label></td>
                      <td data-label="B"><label className="adm-rowcheck-hit"><input type="radio" name="b" value={r.id} defaultChecked={b?.id === r.id} aria-label={`Compare to ${when(r.createdAt)}`} /></label></td>
                      <td data-label="When">
                        <div>{when(r.createdAt)} {i === 0 && <span className="adm-badge adm-badge-ok">current</span>}</div>
                        <div className="adm-help">{r.note || "Saved"} by {actorName(r.createdById)}</div>
                      </td>
                      <td className="adm-td-actions">{canWrite && i > 0 && <RestoreButton csrf={csrf} postId={id} revisionId={r.id} label={when(r.createdAt)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="adm-actions" style={{ marginBlockStart: 12 }}>
                <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm">Compare A to B</button>
              </div>
            </form>
          )}
        </Card>
        <Card title="Differences" description={fa && fb ? `${when(a!.createdAt)} to ${when(b!.createdAt)}: ${changed.length} field${changed.length === 1 ? "" : "s"} changed` : undefined}>
          {!fa || !fb ? (
            <p className="adm-empty">Two revisions are needed to compare.</p>
          ) : changed.length === 0 ? (
            <p className="adm-empty">These two revisions are identical.</p>
          ) : (
            <div className="adm-stack">
              {changed.map((key) => {
                const ops = diffLines(fa[key], fb[key]);
                return (
                  <section key={key} aria-label={label(key)}>
                    <h3 className="adm-diff-title">{label(key)} <span className="adm-help">{changedCount(ops)} line{changedCount(ops) === 1 ? "" : "s"}</span></h3>
                    <pre className="adm-diff" tabIndex={0}>
                      {ops.map((op, i) =>
                        op.kind === "same" ? (
                          <span key={i} className="adm-diff-same">{op.text || " "}{"\n"}</span>
                        ) : op.kind === "add" ? (
                          <ins key={i}>{op.text || " "}{"\n"}</ins>
                        ) : (
                          <del key={i}>{op.text || " "}{"\n"}</del>
                        ),
                      )}
                    </pre>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
