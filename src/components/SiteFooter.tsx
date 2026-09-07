import Link from "next/link";
import { site } from "@/lib/site";
import { SocialIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { industries } from "@/lib/industries";
import { products } from "@/lib/products";
import { t, loc } from "@/lib/i18n";

const whatWeDo = [
  { label: "Digital Transformation", href: "/what-we-do" },
  { label: "AI & Data Solutions", href: "/what-we-do/generative-ai-llm-integration" },
  { label: "Vision & Automation", href: "/what-we-do/computer-vision-image-recognition" },
  { label: "Cloud & DevOps", href: "/what-we-do/cloud-strategy-infrastructure" },
  { label: "Staff Augmentation", href: "/what-we-do/on-demand-developers-engineers" },
];

const company = [
  { label: "Who We Are", href: "/who-we-are" },
  { label: "About DevelMo", href: "/who-we-are/about-develmo" },
  { label: "Careers", href: "/jobs" },
  { label: "Insights", href: "/our-blogs" },
  { label: "Knowledge Base", href: "/our-knowledge-base" },
];

const tierFor = (code: string) =>
  code === "UK" ? "Registered HQ" : code === "PK" ? "Global Delivery Center" : "Regional Office";

export function SiteFooter({ locale }: { locale: string }) {
  const tr = (s: string) => t(s, locale);
  return (
    <footer className="footer">
      {/* Band 1 — statement pre-footer CTA */}
      <section className="foot-cta techgrid">
        <div className="container foot-cta-in">
          <div className="foot-cta-l">
            <span className="mono-label">// LET&apos;S BUILD</span>
            <h2 className="foot-cta-h">
              {locale === "en" ? (
                <>
                  Ship AI that <span className="hl">actually fits</span> your business.
                </>
              ) : (
                tr("Ship AI that actually fits your business.")
              )}
            </h2>
          </div>
          <div className="foot-cta-r">
            <p>
              {tr(
                "Book a free consultation. We will map one high-leverage use case and exactly what it takes to ship it.",
              )}
            </p>
            <div className="foot-cta-row">
              <Button href="/contact-develmo" variant="teal" lg>
                {tr("Book a Free Consultation")}
              </Button>
              <Button href="/our-products" variant="ghost-d" lg>
                {tr("See our products")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        {/* Band 2 — main grid */}
        <div className="foot-grid">
          <div>
            <Link className="brand" href="/" aria-label="DevelMo home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/develmo-logo-white.png" alt="DevelMo" className="brand-logo" />
            </Link>
            <p className="foot-about">
              {tr(
                "Scaling businesses through AI that fits. Custom AI, software and automation, built around how you actually work.",
              )}
            </p>
            <div className="foot-soc">
              {site.social.map((s) => (
                <a key={s.name} href={s.href} aria-label={s.name} rel="noopener noreferrer" target="_blank">
                  <SocialIcon name={s.icon} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h5>{tr("What We Do")}</h5>
            <ul>
              {whatWeDo.map((l) => (
                <li key={l.label}>
                  <Link href={l.href}>{tr(l.label)}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5>{tr("Who We Help")}</h5>
            <ul>
              {industries.map((i) => (
                <li key={i.slug}>
                  <Link href={`/who-we-help/${i.slug}`}>{loc(i, locale, "industries", i.slug).name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5>{tr("Products")}</h5>
            <ul>
              {products.map((p) => (
                <li key={p.slug}>
                  <Link href={p.href}>{p.title}</Link>
                </li>
              ))}
              <li>
                <Link className="foot-viewall" href="/our-products">
                  {tr("View all products")} →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5>{tr("Company")}</h5>
            <ul>
              {company.map((l) => (
                <li key={l.label}>
                  <Link href={l.href}>{tr(l.label)}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Band 3 — contact + global presence */}
        <div className="foot-contact">
          <a href={`mailto:${site.email}`}>{site.email}</a>
          {site.phones.map((p) => (
            <span className="fc-phone" key={p}>
              {p}
            </span>
          ))}
        </div>
        <div className="foot-offices">
          <span className="mono-label">// GLOBAL PRESENCE</span>
          <div className="foot-office-grid">
            {site.offices.map((o) => (
              <div className="foot-office" key={o.code}>
                <span className="fo-code">{o.code}</span>
                <div>
                  <b>
                    {tr(o.name)} <em>{tr(tierFor(o.code))}</em>
                  </b>
                  <small>{tr(o.desc)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Band 4 — legal */}
        <div className="foot-bottom">
          <span className="foot-cred">// BUILT IN-HOUSE · NO TEMPLATES</span>
          <span>© {new Date().getFullYear()} DevelMo. {tr("All rights reserved.")}</span>
          <span>
            <Link href="/privacy">{tr("Privacy Policy")}</Link> ·{" "}
            <Link href="/terms">{tr("Terms of Service")}</Link> ·{" "}
            <Link href="/cookies">{tr("Cookie Policy")}</Link> ·{" "}
            {/* The way in to the admin console. robots.txt disallows /admin,
                so this is for people, not crawlers. */}
            <Link href="/admin/login">{tr("Admin")}</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
