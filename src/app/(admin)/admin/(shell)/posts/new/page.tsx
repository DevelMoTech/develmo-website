import type { Metadata } from "next";
import { PostEditor } from "@/app/(admin)/_components/posts/PostEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { blankEditorValue, existingCategories } from "@/app/(admin)/_lib/post-editor-data";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requirePageUser("/admin/posts/new", { permission: "content:write" });
  const { type } = await searchParams;
  const [csrf, categories] = await Promise.all([getCsrfToken(), existingCategories()]);
  return (
    <>
      <PageHeader kicker="Content" title="New post" description="Saved as a draft until you publish. Ctrl+S saves." actions={<ButtonLink href="/admin/posts">Back to posts</ButtonLink>} />
      <PostEditor csrf={csrf} postId={null} initial={blankEditorValue(type === "kb" ? "kb" : "blog")} categories={categories} savedSlug={null} savedType={null} savedStatus={null} canWrite />
    </>
  );
}
