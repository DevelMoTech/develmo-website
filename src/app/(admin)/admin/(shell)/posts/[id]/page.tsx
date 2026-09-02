import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostEditor } from "@/app/(admin)/_components/posts/PostEditor";
import { Badge, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { editorValueFor, existingCategories, isLive, revisionCount } from "@/app/(admin)/_lib/post-editor-data";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { POST_BASE_PATH } from "@/lib/repo/posts";

export const metadata: Metadata = { title: "Edit post" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE = { published: "ok", draft: "muted", scheduled: "info", archived: "warn" } as const;

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePageUser(`/admin/posts/${id}`, { permission: "content:read" });
  if (!UUID.test(id)) notFound();
  const loaded = await editorValueFor(id);
  if (!loaded) notFound();
  const { value, row } = loaded;
  const [csrf, categories, revisions] = await Promise.all([getCsrfToken(), existingCategories(), revisionCount(id)]);
  const live = isLive(row);
  const publicPath = `${POST_BASE_PATH[row.type]}/${row.slug}`;

  return (
    <>
      <PageHeader
        kicker="Content"
        title={row.title}
        description={
          <>
            <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> <Badge tone="muted">{row.type}</Badge>{" "}
            {live ? (
              <a className="adm-link" href={publicPath} target="_blank" rel="noreferrer">
                {publicPath} <Icon name="external" size={14} />
              </a>
            ) : (
              <span className="adm-mono">{publicPath}</span>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/admin/posts/${id}/revisions`}><Icon name="history" size={18} /> Revisions</ButtonLink>
            <ButtonLink href="/admin/posts">Back to posts</ButtonLink>
          </>
        }
      />
      <PostEditor
        csrf={csrf}
        postId={id}
        initial={value}
        categories={categories}
        savedSlug={row.slug}
        savedType={row.type}
        savedStatus={row.status}
        canWrite={can(user.role, "content:write")}
        updatedAt={row.updatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"}
        revisionCount={revisions}
      />
    </>
  );
}
