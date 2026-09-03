import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { site } from "@/lib/site";
import { aboutContent } from "@/lib/about";
import { getAboutContent } from "@/lib/repo/about";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

// Metadata stays static English from the file copy (HANDOFF §5.3); the page
// body reads the repo with the file as fallback.
const cEn = aboutContent["who-we-are"];

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Who We Are",
  description: cEn.lead,
  path: "/who-we-are",
});

export default async function WhoWeArePage() {
  const locale = await getLocale();
  const cBase = (await getAboutContent("who-we-are")) ?? cEn;
  const c = loc(cBase, locale, "about", "who-we-are");
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="Technology should fit your business"
        subtitle={c.lead}
        crumbs={[{ label: "Home", href: "/" }, { label: "Who We Are" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Who we are")}</div>
          <h2 className="h2">{c.heading}</h2>
          {c.story.map((p, i) => (
            <p className="lead" key={i}>
              {p}
            </p>
          ))}
          <p className="lead">
            <Link href="/who-we-are/about-develmo" style={{ color: "var(--link)", fontWeight: 600 }}>
              Read more about DevelMo →
            </Link>
          </p>
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
          <div className="kicker">{tr("What we value")}</div>
          <h2 className="h2">{tr("How we work with you")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {c.values.map((v) => (
              <div className="card" key={v.title}>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Global presence")}</div>
          <h2 className="h2">{tr("Global delivery, local partnership")}</h2>
          <div className="offices">
            {site.offices.map((o) => (
              <div className="office" key={o.code}>
                <div className="code">{o.code}</div>
                <h4>{o.name}</h4>
                <p>{o.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
