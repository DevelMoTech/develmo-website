import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Build real AI products with a distributed, senior team. DevelMo is always interested in AI/ML, computer vision, full-stack and DevOps engineers.",
};

const perks = [
  { title: "Real AI products", body: "Work on computer vision, LLMs and automation that runs in production for real clients." },
  { title: "Remote-first", body: "A distributed team across the UK, Australia, Saudi Arabia and Pakistan." },
  { title: "Senior, flexible teams", body: "Small teams, real ownership and room to grow across the stack." },
  { title: "Modern tooling", body: "Current frameworks, clean pipelines and a product-quality bar." },
];

export default async function JobsPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="Build AI that fits, with us"
        subtitle="We are a distributed team shipping custom AI, software and automation for clients across 23+ countries."
        crumbs={[{ label: "Home", href: "/" }, { label: "Careers" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Why DevelMo")}</div>
          <h2 className="h2">{tr("What it is like to work here")}</h2>
          <div className="grid g2" style={{ marginTop: 40 }}>
            {perks.map((p) => (
              <div className="card" key={p.title}>
                <h3>{tr(p.title)}</h3>
                <p>{tr(p.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Open roles")}</div>
          <h2 className="h2">{tr("We are always meeting good engineers")}</h2>
          <p className="lead">
            {tr(
              "We do not always have a role posted, but we are consistently interested in AI/ML, computer vision, full-stack and DevOps engineers. If that is you, send your CV and a note on what you have built to",
            )}{" "}
            <a href="mailto:info@develmo.com" style={{ color: "var(--link)", fontWeight: 600 }}>
              info@develmo.com
            </a>
            .
          </p>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Think you would <span className="hl">fit</span> here?
          </>
        }
        titleText="Think you would fit here?"
        text="Tell us what you have built and where you want to grow. We read every message."
      />
    </>
  );
}
