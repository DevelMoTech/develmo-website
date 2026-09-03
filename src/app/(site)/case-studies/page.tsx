import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/case-studies", {
  title: "Case Studies",
  description:
    "Representative outcomes from DevelMo engagements across retail, healthcare, banking and more. Detailed case studies are added as clients approve.",
});

const snapshots = [
  { industry: "Retail & CPG", title: "Footfall analytics with CrowdIQ", body: "Turned existing store cameras into footfall, dwell and demographic dashboards, with no new hardware." },
  { industry: "Healthcare", title: "Document automation", body: "Automated intake document processing to cut manual review time and free up clinical staff." },
  { industry: "Banking & Fintech", title: "Anomaly detection", body: "Flagged suspicious activity earlier with an AI scoring model wired into existing systems." },
];

export default async function CaseStudiesPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="Case Studies"
        subtitle="A look at the kinds of outcomes we deliver. Detailed, named case studies are added here as clients approve them."
        crumbs={[{ label: "Home", href: "/" }, { label: "Case Studies" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Representative outcomes")}</div>
          <h2 className="h2">{tr("What we help teams achieve")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {snapshots.map((s) => (
              <div className="card" key={s.title}>
                <span className="badge soon">{tr(s.industry)}</span>
                <h3 style={{ marginTop: 12 }}>{tr(s.title)}</h3>
                <p>{tr(s.body)}</p>
              </div>
            ))}
          </div>
          <p className="lead" style={{ marginTop: 28 }}>
            {tr(
              "Want the detail behind these? Get in touch and we will walk you through the most relevant example for your sector.",
            )}
          </p>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
