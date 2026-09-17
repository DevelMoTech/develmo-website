import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostArticle, postPath } from "@/components/PostArticle";
import { getCurrentSessionIfReachable } from "@/lib/auth/current";
import { allows } from "@/lib/auth/role-access";
import { isLocale } from "@/lib/i18n";
import { getPostByIdForPreview } from "@/lib/repo/posts";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Draft preview (brief §3.3): the real public post template, any status,
// for signed-in staff with content:read. Everyone else gets a 404, never a
// login redirect, so the URL reveals nothing about the post's existence.
export default async function PostPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const auth = await getCurrentSessionIfReachable();
  if (!auth || auth.session.mfaPending || !(await allows(auth.user.role, "content:read"))) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { locale: rawLocale } = await searchParams;
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const post = await getPostByIdForPreview(id, locale);
  if (!post) notFound();

  return (
    <>
      <div
        role="status"
        style={{
          background: "#021c26",
          color: "#e6f0f5",
          padding: "10px 16px",
          fontSize: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 18px",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span>
          Preview of <strong>{post.title}</strong> ({locale.toUpperCase()}). Not public. Address when live: <code>{postPath(post)}</code>
        </span>
        <a href={`/admin/posts/${id}`} style={{ color: "#3df2e0", fontWeight: 700 }}>
          Back to the editor
        </a>
      </div>
      <PostArticle post={post} />
    </>
  );
}
