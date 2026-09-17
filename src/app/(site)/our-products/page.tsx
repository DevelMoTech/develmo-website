import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { getProducts } from "@/lib/repo/products";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Our Products",
  description:
    "DevelMo products: CrowdIQ video analytics and PadelIQ padel and sports analytics.",
  path: "/our-products",
});

export default async function OurProductsPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const products = await getProducts();
  return (
    <>
      <PageHero
        title="Our Products"
        subtitle="DevelMo builds and ships its own AI products, so you can adopt proven intelligence fast or have it tailored to your environment."
        crumbs={[{ label: "Home", href: "/" }, { label: "Our Products" }]}
      />

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("AI products")}</div>
          <h2 className="h2">{tr("Built to deploy, not just demo")}</h2>
          <div className="grid g2" style={{ marginTop: 40 }}>
            {products.map((pBase) => {
              const p = loc(pBase, locale, "products", pBase.slug);
              return (
                <Link className="card prod" href={pBase.href} key={pBase.slug}>
                  <div className="top">
                    <div className="logo" style={{ background: pBase.bg, color: pBase.fg }}>
                      {pBase.initial}
                    </div>
                    <span className={`badge ${pBase.badge}`}>
                      {pBase.badge === "live" ? tr("Live") : tr("Coming soon")}
                    </span>
                  </div>
                  <h3>{pBase.title}</h3>
                  <p style={{ color: "var(--blue-ink)", fontWeight: 600, fontSize: 13.5, margin: "2px 0 8px" }}>
                    {p.tagline}
                  </p>
                  <p>{p.summary}</p>
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
