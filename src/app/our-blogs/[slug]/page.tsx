import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { posts, getPost, formatDate } from "@/lib/posts";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: `${site.url}/our-blogs/${post.slug}`,
  };

  return (
    <>
      <PageHero
        title={post.title}
        subtitle={`${post.category} · ${formatDate(post.date)} · ${post.author}`}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Our Blogs", href: "/our-blogs" },
          { label: post.category },
        ]}
      />

      <section className="section">
        <div className="container">
          <article className="prose" style={{ maxWidth: 760, margin: "0 auto" }}>
            {post.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
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
        primaryHref={`/contact-develmo?source=blog&topic=${post.slug}`}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
    </>
  );
}
