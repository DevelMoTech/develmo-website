import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { aboutContent } from "@/lib/about";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

const cEn = aboutContent["about-develmo"];

export const metadata: Metadata = pageMeta({
  title: "About DevelMo",
  description: cEn.lead,
  path: "/who-we-are/about-develmo",
});

export default async function AboutDevelMoPage() {
  const locale = await getLocale();
  const c = loc(cEn, locale, "about", "about-develmo");
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="About DevelMo"
        subtitle={c.lead}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Who We Are", href: "/who-we-are" },
          { label: "About DevelMo" },
        ]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Our story")}</div>
          <h2 className="h2">{c.heading}</h2>
          {c.story.map((p, i) => (
            <p className="lead" key={i}>
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Vision & mission")}</div>
          <div className="grid g2" style={{ marginTop: 26 }}>
            <div className="card">
              <h3>{tr("Our vision")}</h3>
              <p style={{ fontSize: 16 }}>{c.vision}</p>
            </div>
            <div className="card">
              <h3>{tr("Our mission")}</h3>
              <p style={{ fontSize: 16 }}>{c.mission}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Why DevelMo")}</div>
          <h2 className="h2">{tr("A product and engineering partner, not a vendor")}</h2>
          <div className="grid g2" style={{ marginTop: 40 }}>
            {c.differentiators.map((w) => (
              <div className="card" key={w.title}>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
