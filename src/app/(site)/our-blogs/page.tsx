import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { formatDate } from "@/lib/posts";
import { getPosts } from "@/lib/repo/posts";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Our Blogs",
  description:
    "Practical articles on AI, computer vision, cloud and building software that ships, from the DevelMo team.",
};

export default async function BlogPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const posts = await getPosts("blog", locale);
  return (
    <>
      <PageHero
        title="Our Blogs"
        subtitle="Practical notes on AI, computer vision, cloud and building software that actually ships."
        crumbs={[{ label: "Home", href: "/" }, { label: "Our Blogs" }]}
      />

      <section className="section">
        <div className="container">
          <div className="grid g3">
            {posts.map((p) => (
              <Link className="card" href={`/our-blogs/${p.slug}`} key={p.slug}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-ink)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {p.category} · {formatDate(p.date)}
                </div>
                <h3 style={{ marginTop: 8 }}>{p.title}</h3>
                <p>{p.excerpt}</p>
                <span className="link">{tr("Read article")} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
