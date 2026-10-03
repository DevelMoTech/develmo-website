import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { advisors, boardPillars } from "@/lib/advisory";
import { site } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";
import { jsonLd } from "@/lib/jsonld";

// The Company Advisory Board, from the owner's page draft of September 2026.
//
// Two departures from that draft, both deliberate:
//   - The draft names OmniRoad 2.0 among the production products. It was
//     withdrawn and is filtered out of the site everywhere else, so it is not
//     named here either.
//   - The draft's profile visual is a purple ringed placeholder. Purple is out
//     under the brand rules, so the monogram below is drawn in the DevelMo
//     palette. It stays a monogram until the owner supplies a headshot each
//     member has approved.

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Company Advisory Board",
  description:
    "DevelMo's Company Advisory Board brings together senior technology and industry leaders across cloud, telecommunications, AI infrastructure, digital platforms and enterprise transformation.",
  path: "/who-we-are/advisory-board",
});

// A branded monogram: three rings in the DevelMo palette around the member's
// initials. Decorative, so it is hidden from assistive technology; the name
// sits beside it in text.
function Monogram({ initials }: { initials: string }) {
  return (
    <svg className="adv-mono" viewBox="0 0 132 132" role="presentation" aria-hidden="true">
      <rect width="132" height="132" rx="14" fill="var(--ink)" />
      <circle cx="66" cy="66" r="52" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity=".75" />
      <circle cx="66" cy="66" r="45" fill="none" stroke="var(--blue)" strokeWidth="2" />
      <circle cx="66" cy="66" r="38" fill="none" stroke="var(--teal)" strokeWidth="1.5" opacity=".85" />
      <circle cx="66" cy="66" r="32" fill="#fff" />
      <text
        x="66"
        y="66"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontFamily="var(--font-head)"
        fontWeight="800"
        fontSize={initials.length > 2 ? 21 : 26}
        letterSpacing=".5"
      >
        {initials}
      </text>
    </svg>
  );
}

export default async function AdvisoryBoardPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);

  // Person entries for the two members. sameAs only appears once the owner
  // has filled in a profile URL, because a wrong one is worse than none.
  const people = advisors.map((a) => ({
    "@context": "https://schema.org",
    "@type": "Person",
    name: a.name,
    jobTitle: "Advisory Board Member",
    description: a.bio,
    knowsAbout: a.areas,
    affiliation: { "@type": "Organization", name: site.name, url: site.url },
    ...(a.linkedin ? { sameAs: [a.linkedin] } : {}),
  }));

  return (
    <>
      <PageHero
        title="Guiding DevelMo's Next Chapter"
        subtitle="Independent perspective. Deep technology experience. Practical guidance for responsible, scalable growth."
        crumbs={[{ label: "Home", href: "/" }, { label: "Who We Are", href: "/who-we-are" }, { label: "Advisory Board" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The board")}</div>
          <h2 className="h2">{tr("A board built around the technology DevelMo ships")}</h2>
          <p className="lead" style={{ maxWidth: "76ch" }}>
            {tr(
              "DevelMo's Company Advisory Board brings together senior technology and industry leaders with experience across cloud, telecommunications, AI infrastructure, digital platforms and enterprise transformation. The board provides an external strategic perspective as DevelMo scales products, strengthens enterprise delivery and expands internationally.",
            )}
          </p>

          <div className="pillar-grid">
            {boardPillars.map((p) => (
              <div className="pillar" key={p.title}>
                <span className="idx">{p.n}</span>
                <h3>{tr(p.title)}</h3>
                <p>{tr(p.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Advisory board")}</div>
          <h2 className="h2">{tr("The people at the table")}</h2>
          <p className="lead" style={{ maxWidth: "64ch" }}>
            {tr("Each member advises DevelMo in a personal capacity, on the areas listed beside their name.")}
          </p>

          <div className="advisors">
            {advisors.map((a) => (
              <article className="advisor" key={a.slug}>
                <div className="adv-side">
                  <Monogram initials={a.initials} />
                  <span className="adv-role-label">{tr("Advisory board member")}</span>
                  {a.linkedin ? (
                    <a className="adv-link" href={a.linkedin} target="_blank" rel="noopener noreferrer">
                      {tr("LinkedIn profile")} <span aria-hidden="true">→</span>
                    </a>
                  ) : null}
                </div>
                <div className="adv-body">
                  {/* A person's name reads the same in every language, like the
                      product names, so it does not go through tr(). */}
                  <h3>{a.name}</h3>
                  <p className="adv-role">{tr(a.role)}</p>
                  <p className="adv-bio">{tr(a.bio)}</p>
                  <div className="adv-areas">
                    <span className="adv-areas-label">{tr("Areas of advisory")}</span>
                    <ul>
                      {a.areas.map((area) => (
                        <li key={area}>{tr(area)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Strategic guidance")}</div>
          <h2 className="h2">{tr("Experience that complements what we build")}</h2>
          <p className="lead" style={{ maxWidth: "76ch" }}>
            {tr(
              "DevelMo builds custom AI, computer vision, cloud and software solutions alongside its own products, CrowdIQ and PadelIQ. The Advisory Board adds experienced external perspective around technology direction, enterprise readiness, infrastructure choices and the opportunities created by AI-native platforms and future networks.",
            )}
          </p>
          <p className="lead">
            <Link href="/our-products" style={{ color: "var(--link)", fontWeight: 600 }}>
              {tr("Explore our products")} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      <CtaBand />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(people) }} />
    </>
  );
}
