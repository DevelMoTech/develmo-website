import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { notFound } from "next/navigation";
import { PostArticle, postMetadata } from "@/components/PostArticle";
import { getLocale } from "@/lib/i18n-server";
import { getPost } from "@/lib/repo/posts";

// Knowledge base articles share the post model with type "kb" (brief §3.3).
// Rendered per request: the locale cookie selects translated fields and the
// repo layer caches the data, so nothing here can be prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug, "kb", await getLocale());
  if (!post) return {};
  return withSeoOverride(`/our-knowledge-base/${post.slug}`, postMetadata(post));
}

export default async function KnowledgeBaseArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug, "kb", await getLocale());
  if (!post) notFound();
  return <PostArticle post={post} />;
}
