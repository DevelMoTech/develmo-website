import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { Icon } from "@/components/icons";
import { getIndustries } from "@/lib/repo/industries";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Who We Help",
  description:
    "Domain-aware AI, software and automation for healthcare, telecom, energy, hospitality, e-commerce, banking, public sector, retail, startups and gaming.",
  path: "/who-we-help",
});

export default async function WhoWeHelpPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const industries = await getIndustries();
  return (
    <>
      <PageHero
        title="Who We Help"
        subtitle="Domain-aware delivery across the sectors where AI moves the needle on cost, risk and growth."
        crumbs={[{ label: "Home", href: "/" }, { label: "Who We Help" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Industries we serve")}</div>
          <h2 className="h2">{tr("Ten sectors, one delivery partner")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {industries.map((iBase) => {
              const i = loc(iBase, locale, "industries", iBase.slug);
              return (
                <Link className="card" href={`/who-we-help/${iBase.slug}`} key={iBase.slug}>
                  <div className="ico">
                    <Icon name={iBase.icon} />
                  </div>
                  <h3 style={{ fontSize: 17 }}>{i.name}</h3>
                  <p>{i.blurb}</p>
                  <span className="link">{tr("Explore")} →</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
