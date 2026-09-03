import Link from "next/link";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { HeroStage } from "@/components/HeroStage";
import { ProductCollage } from "@/components/ProductCollage";
import { ProductSlider } from "@/components/ProductSlider";
import { getPillars } from "@/lib/repo/services";
import { getIndustries } from "@/lib/repo/industries";
import { getLocale } from "@/lib/i18n-server";
import { t, loc } from "@/lib/i18n";
import { withSeoOverride } from "@/lib/meta";

// The home page's metadata lives in the root layout; only an override from
// /admin/seo/pages changes it.
export const generateMetadata = () => withSeoOverride("/", {});

const why = [
  { icon: "custom", title: "Custom that fits", body: "Solutions shaped around your data, goals and operations, never forced into a template." },
  { icon: "product", title: "Product mindset", body: "We build for production, with quality, measurement and maintainability from day one." },
  { icon: "teams", title: "Flexible teams", body: "Scale specialist talent up or down on demand without growing your headcount." },
  { icon: "enterprise", title: "Enterprise delivery", body: "Scalable, secure delivery trusted across 23+ countries." },
];

// Real DevelMo client logos, lifted from the original develmo.com.
const clients = [
  { src: "/clients/kababji-removebg-preview.png", name: "Kababji" },
  { src: "/clients/kamaras_african_restaturant-removebg-preview.png", name: "Kamara's African Restaurant" },
  { src: "/clients/red_events-removebg-preview.png", name: "Red Events" },
  { src: "/clients/seatech_innovation-removebg-preview.png", name: "Seatech Innovation" },
  { src: "/clients/sibrossa_ltd-removebg-preview.png", name: "Sibrossa Ltd" },
  { src: "/clients/The_Mop-removebg-preview-non-crop-1.png", name: "The Mop" },
  { src: "/clients/Untitled_design__1_-removebg-preview.png", name: "DevelMo client" },
];
const clientsRev = [...clients].reverse();

export default async function Home() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const pillars = await getPillars();
  const featuredIndustries = (await getIndustries()).slice(0, 6);
  return (
    <>
      {/* 1 · HERO (full background video) */}
      <HeroStage locale={locale} />

      {/* CLIENTS marquee (right after hero, devsinc-style two-row) */}
      <section className="clients">
        <div className="container">
          <p className="clients-label">{tr("Trusted by teams and brands worldwide")}</p>
        </div>
        <div className="clients-marquee">
          <div className="clients-row">
            {[...clients, ...clients].map((c, i) => (
              <span className="client-tile" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt={c.name} className="client-logo" />
              </span>
            ))}
          </div>
        </div>
        <div className="clients-marquee">
          <div className="clients-row rev">
            {[...clientsRev, ...clientsRev].map((c, i) => (
              <span className="client-tile" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt={c.name} className="client-logo" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* S01 · KEY FLAGSHIP PRODUCTS */}
      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Flagship products")}</div>
          <h2 className="h2">{tr("Key Flagship Products")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "Four DevelMo products live in production today, not demos. Adopt them as they are, or have them tailored to your environment.",
            )}
          </p>
          <ProductSlider locale={locale} />
        </div>
      </section>

      {/* S02 · SOLUTIONS WE DELIVER (image-overlay cards) */}
      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("What we do")}</div>
          <h2 className="h2">{tr("Solutions We Deliver")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "One partner across the full stack of AI, product and infrastructure, with flexible teams that scale up or down with you.",
            )}
          </p>
          <div className="imgcard-grid">
            {pillars.map((p, idx) => (
              <Link
                className={`imgcard${idx === 0 ? " glow-teal" : ""}`}
                href="/what-we-do"
                key={p.key}
                style={{ backgroundImage: `url(/cards/sol-${idx + 1}.jpg)` }}
              >
                <div className="imgcard-body">
                  <div className="ico-glass">
                    <Icon name={p.icon} />
                  </div>
                  <div>
                    <h3>{tr(p.title)}</h3>
                    <p>{tr(p.blurb)}</p>
                    <span className="imgcard-link">{tr("Explore")} →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="solutions-foot">
            <span className="mono-label">// need the full stack?</span>
            <Button href="/what-we-do" variant="navy" lg>
              {tr("Let's Get Started")}
            </Button>
          </div>
        </div>
      </section>

      {/* S03 · TARGET INDUSTRIES (image-overlay cards) */}
      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Who we help")}</div>
          <h2 className="h2">{tr("Target Industries")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "Domain-aware delivery across the sectors where AI moves the needle on cost, risk and growth.",
            )}
          </p>
          <div className="imgcard-grid">
            {featuredIndustries.map((iBase, idx) => {
              const i = loc(iBase, locale, "industries", iBase.slug);
              return (
                <Link
                  className={`imgcard${idx === 0 ? " glow-teal" : ""}`}
                  href={`/who-we-help/${iBase.slug}`}
                  key={iBase.slug}
                  style={{ backgroundImage: `url(/cards/ind-${idx + 1}.jpg)` }}
                >
                  <div className="imgcard-body">
                    <div className="ico-glass">
                      <Icon name={iBase.icon} />
                    </div>
                    <div>
                      <h3>{i.name}</h3>
                      <p>{i.blurb}</p>
                      <span className="imgcard-link">{tr("Explore")} →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="section-cta">
            <Button href="/who-we-help" variant="navy" lg>
              {tr("See All Industries")}
            </Button>
          </div>
        </div>
      </section>

      {/* S04 · WHY CHOOSE DEVELMO */}
      <section className="section bg-dark techgrid">
        <div className="container">
          <div className="spot-in">
            <div>
              <div className="kicker">{tr("Why DevelMo")}</div>
              <h2 className="h2">{tr("Why Choose DevelMo?")}</h2>
              <hr className="hr-tick" />
              <p className="lead">
                {tr(
                  "Technology should fit your business, not the other way around. That belief shapes how we scope, build and hand over every project.",
                )}
              </p>
              <div className="grid g2" style={{ marginTop: 30 }}>
                {why.map((w) => (
                  <div className="why panel" key={w.title}>
                    <div className="ic">
                      <Icon name={w.icon} />
                    </div>
                    <h3>{tr(w.title)}</h3>
                    <p>{tr(w.body)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="glow-teal panel-raise">
              <ProductCollage />
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
