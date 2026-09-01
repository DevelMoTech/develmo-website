import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { products, getProduct } from "@/lib/products";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

// CrowdIQ has its own dedicated route; the rest render from this template.
export function generateStaticParams() {
  return products.filter((p) => p.slug !== "crowdiq").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getProduct(slug);
  if (!p) return {};
  return pageMeta({ title: `${p.title}: ${p.tagline}`, description: p.summary, path: `/our-products/${slug}` });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = getProduct(slug);
  if (!base) notFound();
  const locale = await getLocale();
  const p = loc(base, locale, "products", slug);
  const tr = (x: string) => t(x, locale);

  return (
    <>
      <PageHero
        title={p.title}
        subtitle={p.tagline}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Our Products", href: "/our-products" },
          { label: p.title },
        ]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Overview")}</div>
          <h2 className="h2">{p.tagline}</h2>
          <p className="lead">{p.summary}</p>
          {p.intro && <p className="lead">{p.intro}</p>}

          {p.stats && (
            <div className="kpis" style={{ marginTop: 28, gridTemplateColumns: `repeat(${p.stats.length},1fr)` }}>
              {p.stats.map((s) => {
                const [value, ...rest] = s.split(" ");
                return (
                  <div className="kpi" key={s}>
                    <strong>{value}</strong>
                    <span>{rest.join(" ")}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="kicker" style={{ marginTop: 40 }}>
            {tr("Key capabilities")}
          </div>
          <ul className="feat-light" style={{ marginTop: 18 }}>
            {p.features.map((f) => (
              <li key={f}>
                <span className="tick">✓</span>
                <div>{f}</div>
              </li>
            ))}
          </ul>

          {p.forWho && (
            <div className="callout" style={{ marginTop: 30 }}>
              <p className="callout-title">{tr("Who it is for")}</p>
              <p style={{ margin: 0, color: "var(--muted)" }}>{p.forWho}</p>
            </div>
          )}
        </div>
      </section>

      {p.howItWorks && p.howItWorks.length > 0 && (
        <section className="section bg-light">
          <div className="container">
            <div className="kicker">{tr("How it works")}</div>
            <h2 className="h2">{tr("From setup to insight")}</h2>
            <div className="grid g3" style={{ marginTop: 40 }}>
              {p.howItWorks.map((step, idx) => (
                <div className="outcome" key={step.title}>
                  <div className="n">{String(idx + 1).padStart(2, "0")}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {p.faqs && p.faqs.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="kicker">FAQ</div>
            <h2 className="h2">{tr("Common questions")}</h2>
            <div className="faq" style={{ marginTop: 30 }}>
              {p.faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: p.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
        </section>
      )}

      <CtaBand
        title={
          <>
            Want to see <span className="hl">{p.title}</span> in action?
          </>
        }
        text="See it run on a sample of your own footage or data. No obligation."
        primaryLabel="Request a Demo"
        primaryHref={`/contact-develmo?intent=demo&product=${p.slug}`}
      />
    </>
  );
}
