import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { renderMarkdown } from "@/lib/markdown";
import { OG_IMAGE } from "@/lib/meta";
import { formatDate } from "@/lib/posts";
import { POST_BASE_PATH, type PublicPost } from "@/lib/repo/posts";
import { site } from "@/lib/site";

// The one public post template, used by /our-blogs/[slug],
// /our-knowledge-base/[slug] and the authenticated draft preview, so a
// preview is exactly what the public will see.

const CRUMB: Record<PublicPost["type"], { label: string; href: string }> = {
  blog: { label: "Our Blogs", href: "/our-blogs" },
  kb: { label: "Knowledge Base", href: "/our-knowledge-base" },
};

export function postPath(post: Pick<PublicPost, "type" | "slug">): string {
  return `${POST_BASE_PATH[post.type]}/${post.slug}`;
}

export function postMetadata(post: PublicPost): Metadata {
  const path = postPath(post);
  const title = post.seo.metaTitle ?? post.title;
  const description = post.seo.metaDescription ?? post.excerpt;
  const ogTitle = `${title} | DevelMo`;
  const image = post.seo.ogImage ?? post.hero;
  const images = image
    ? [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.alt || title }]
    : [OG_IMAGE];
  return {
    title,
    description,
    // Only set when flagged: an explicit undefined would drop the layout default.
    ...(post.seo.noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: post.seo.canonical ?? path },
    openGraph: {
      type: "article",
      siteName: "DevelMo",
      url: path,
      title: ogTitle,
      description,
      images,
      publishedTime: `${post.date}T00:00:00.000Z`,
      modifiedTime: `${post.updated}T00:00:00.000Z`,
      authors: [post.author],
      tags: post.category ? [post.category] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export async function PostArticle({ post }: { post: PublicPost }) {
  const crumb = CRUMB[post.type];
  const body = await renderMarkdown(post.bodyMd);
  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: `${site.url}${postPath(post)}`,
  };
  if (post.hero) articleLd.image = `${site.url}${post.hero.url}`;

  return (
    <>
      <PageHero
        title={post.title}
        subtitle={`${post.category} · ${formatDate(post.date)} · ${post.author}`}
        crumbs={[
          { label: "Home", href: "/" },
          { label: crumb.label, href: crumb.href },
          { label: post.category },
        ]}
      />

      <section className="section">
        <div className="container">
          <article className="prose" style={{ maxWidth: 760, margin: "0 auto" }}>
            {post.hero && (
              <img
                src={post.hero.url}
                alt={post.hero.alt}
                width={post.hero.width ?? undefined}
                height={post.hero.height ?? undefined}
                style={{ width: "100%", height: "auto", borderRadius: 16, marginBottom: 28 }}
              />
            )}
            {body}
          </article>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Have a project like <span className="hl">this</span>?
          </>
        }
        text="Let us scope it. Free consultation, reply within one business day."
        primaryHref={`/contact-develmo?source=${post.type}&topic=${post.slug}`}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
    </>
  );
}
