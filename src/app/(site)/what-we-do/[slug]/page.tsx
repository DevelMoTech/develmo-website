import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { getPillar, getService, getServices, getServicesByPillar } from "@/lib/repo/services";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";
import { faqSchemaEnabled } from "@/lib/seo/overrides";
import { jsonLd } from "@/lib/jsonld";

export async function generateStaticParams() {
  const services = await getServices();
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getService(slug);
  if (!s) return {};
  return pageMeta({ title: s.title, description: s.blurb, path: `/what-we-do/${slug}` });
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const faqSchema = await faqSchemaEnabled(`/what-we-do/${slug}`);
  const base = await getService(slug);
  if (!base) notFound();
  const locale = await getLocale();
  const s = loc(base, locale, "services", slug);
  const tr = (x: string) => t(x, locale);
  const pillar = await getPillar(s.pillar);
  const related = (await getServicesByPillar(s.pillar)).filter((x) => x.slug !== s.slug);

  return (
    <>
      <PageHero
        title={s.title}
        subtitle={s.blurb}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "What We Do", href: "/what-we-do" },
          { label: s.title },
        ]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{pillar?.title}</div>
          <h2 className="h2">{tr("What we deliver")}</h2>
          <p className="lead">{s.intro}</p>
          <ul className="feat-light" style={{ marginTop: 26 }}>
            {s.capabilities.map((c) => (
              <li key={c}>
                <span className="tick">✓</span>
                <div>{c}</div>
              </li>
            ))}
          </ul>
          <div className="kicker" style={{ marginTop: 40 }}>
            {tr("Technology")}
          </div>
          <div className="pills" style={{ justifyContent: "flex-start" }}>
            {s.tech.map((t) => (
              <span className="pill" key={t}>
                {t}
              </span>
            ))}
          </div>

          {s.outcomes && s.outcomes.length > 0 && (
            <>
              <div className="kicker" style={{ marginTop: 46 }}>
                {tr("What you get")}
              </div>
              <div className="grid g3" style={{ marginTop: 26 }}>
                {s.outcomes.map((o) => (
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

      {related.length > 0 && (
        <section className="section bg-light">
          <div className="container">
            <div className="kicker">{tr("More in")} {pillar?.title}</div>
            <h2 className="h2">{tr("Related services")}</h2>
            <div className="grid g3" style={{ marginTop: 36 }}>
              {related.map((r) => {
                const rl = loc(r, locale, "services", r.slug);
                return (
                  <Link className="card" href={`/what-we-do/${r.slug}`} key={r.slug}>
                    <h3 style={{ fontSize: 17 }}>{rl.title}</h3>
                    <p>{rl.blurb}</p>
                    <span className="link">{tr("Explore")} →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {s.faqs && s.faqs.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="kicker">FAQ</div>
            <h2 className="h2">{tr("Common questions")}</h2>
            <div className="faq" style={{ marginTop: 30 }}>
              {s.faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
          {faqSchema && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLd({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: s.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }),
              }}
            />
          )}
        </section>
      )}

      <CtaBand
        primaryHref={`/contact-develmo?service=${s.slug}`}
        text="Talk to an engineer who has shipped this, not a salesperson. Free 30-minute consultation."
      />
    </>
  );
}
