import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { formatDate } from "@/lib/posts";
import { getPosts } from "@/lib/repo/posts";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/our-knowledge-base", {
  title: "Knowledge Base",
  description:
    "Guides, insights and practical resources on AI, computer vision, cloud and building software that ships.",
});

const topics = [
  { t: "AI & Data", d: "Generative AI, predictive models and data strategy." },
  { t: "Computer Vision", d: "Detection, tracking and real-time video analytics." },
  { t: "Cloud & DevOps", d: "Infrastructure, CI/CD and MLOps." },
  { t: "Building products", d: "Shipping reliable software and AI features." },
];

export default async function KnowledgeBasePage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const posts = await getPosts("blog", locale);
  // Knowledge base articles (type "kb") are DB driven; the section only
  // renders once at least one exists, so the page is unchanged until then.
  const articles = await getPosts("kb", locale);
  return (
    <>
      <PageHero
        title="Knowledge Base"
        subtitle="Guides, insights and practical resources from the DevelMo team."
        crumbs={[{ label: "Home", href: "/" }, { label: "Knowledge Base" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Browse by topic")}</div>
          <h2 className="h2">{tr("What you can learn here")}</h2>
          <div className="grid g4" style={{ marginTop: 36 }}>
            {topics.map((x) => (
              <div className="card" key={x.t}>
                <h3 style={{ fontSize: 16 }}>{tr(x.t)}</h3>
                <p>{tr(x.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {articles.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="kicker">{tr("Knowledge Base")}</div>
            <h2 className="h2">{tr("Guides and articles")}</h2>
            <div className="grid g3" style={{ marginTop: 36 }}>
              {articles.map((p) => (
                <Link className="card" href={`/our-knowledge-base/${p.slug}`} key={p.slug}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-ink)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                    {p.category} · {formatDate(p.date)}
                  </div>
                  <h3 style={{ marginTop: 8, fontSize: 17 }}>{p.title}</h3>
                  <p>{p.excerpt}</p>
                  <span className="link">{tr("Read article")} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Latest articles")}</div>
          <h2 className="h2">{tr("From our blog")}</h2>
          <div className="grid g3" style={{ marginTop: 36 }}>
            {posts.map((p) => (
              <Link className="card" href={`/our-blogs/${p.slug}`} key={p.slug}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-ink)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {p.category} · {formatDate(p.date)}
                </div>
                <h3 style={{ marginTop: 8, fontSize: 17 }}>{p.title}</h3>
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
