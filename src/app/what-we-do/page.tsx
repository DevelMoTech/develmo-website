import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { Icon } from "@/components/icons";
import { pillars, servicesByPillar } from "@/lib/services";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta({
  title: "What We Do",
  description:
    "Six service pillars and 21 capabilities across AI, data, computer vision, web and mobile, cloud, DevOps, security and staff augmentation.",
  path: "/what-we-do",
});

export default async function WhatWeDoPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="What We Do"
        subtitle="Scaling businesses through AI that fits. One partner across the full stack of AI, product and infrastructure."
        crumbs={[{ label: "Home", href: "/" }, { label: "What We Do" }]}
      />

      {pillars.map((p, i) => (
        <section className={i % 2 === 1 ? "section bg-light" : "section"} key={p.key}>
          <div className="container">
            <div className="kicker">{tr("Pillar")} {String(i + 1).padStart(2, "0")}</div>
            <h2 className="h2">{tr(p.title)}</h2>
            <p className="lead">{tr(p.blurb)}</p>
            <div className="grid g2" style={{ marginTop: 36 }}>
              {servicesByPillar(p.key).map((sBase) => {
                const s = loc(sBase, locale, "services", sBase.slug);
                return (
                  <Link className="card svc" href={`/what-we-do/${sBase.slug}`} key={sBase.slug}>
                    <div className="ico">
                      <Icon name={p.icon} />
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.blurb}</p>
                    <span className="link">{tr("Explore")} →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <CtaBand />
    </>
  );
}
