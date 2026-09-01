import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { industries, getIndustry } from "@/lib/industries";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

export function generateStaticParams() {
  return industries.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const i = getIndustry(slug);
  if (!i) return {};
  return pageMeta({ title: i.name, description: i.blurb, path: `/who-we-help/${slug}` });
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = getIndustry(slug);
  if (!base) notFound();
  const locale = await getLocale();
  const i = loc(base, locale, "industries", slug);
  const tr = (x: string) => t(x, locale);

  return (
    <>
      <PageHero
        title={i.name}
        subtitle={i.blurb}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Who We Help", href: "/who-we-help" },
          { label: i.name },
        ]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The challenge")}</div>
          <h2 className="h2">{i.challenge}</h2>
          {i.approach && <p className="lead">{i.approach}</p>}
          <div className="kicker" style={{ marginTop: 40 }}>
            {tr("How DevelMo helps")}
          </div>
          <ul className="feat-light" style={{ marginTop: 18 }}>
            {i.solutions.map((sol) => (
              <li key={sol}>
                <span className="tick">✓</span>
                <div>{sol}</div>
              </li>
            ))}
          </ul>
          {i.outcomes && i.outcomes.length > 0 && (
            <>
              <div className="kicker" style={{ marginTop: 46 }}>
                {tr("Outcomes")}
              </div>
              <div className="grid g3" style={{ marginTop: 26 }}>
                {i.outcomes.map((o) => (
                  <div className="card" key={o.title}>
                    <h3 style={{ fontSize: 17 }}>{o.title}</h3>
                    <p>{o.body}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {i.faqs && i.faqs.length > 0 && (
        <section className="section bg-light">
          <div className="container">
            <div className="kicker">FAQ</div>
            <h2 className="h2">{tr("Common questions")}</h2>
            <div className="faq" style={{ marginTop: 30 }}>
              {i.faqs.map((f) => (
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
                mainEntity: i.faqs.map((f) => ({
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
        primaryHref={`/contact-develmo?industry=${i.slug}`}
        text={`We have shipped AI in ${i.name}. Book a free consultation and we will show you where it pays off.`}
      />
    </>
  );
}
