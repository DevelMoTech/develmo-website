import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ContactForm } from "@/components/ContactForm";
import { site } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Contact DevelMo",
  description:
    "Book a free consultation with DevelMo. Tell us about your AI, automation or software project and we will reply within one business day.",
  path: "/contact-develmo",
});

export default async function ContactPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title={tr("Let's Talk")}
        subtitle="Tell us what you are building or the problem you want to solve. We will map the highest-impact opportunity and reply within one business day."
        crumbs={[{ label: "Home", href: "/" }, { label: "Contact" }]}
      />

      <section className="section">
        <div className="container contact-grid">
          <div>
            <ContactForm locale={locale} />
          </div>
          <div className="contact-info">
            <div className="blk">
              <h4>{tr("Email")}</h4>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
            <div className="blk">
              <h4>{tr("Call")}</h4>
              {site.phones.map((p) => (
                <a key={p} href={`tel:${p.replace(/\s/g, "")}`}>
                  {p}
                </a>
              ))}
            </div>
            <div className="blk">
              <h4>{tr("Head office")}</h4>
              <p>
                {site.address.line}, {site.address.city} {site.address.postcode},{" "}
                {site.address.country}
              </p>
            </div>
            <div className="blk">
              <h4>{tr("Offices")}</h4>
              <p>{tr("United Kingdom · Australia · Saudi Arabia · Pakistan")}</p>
            </div>
            <div className="blk">
              <h4>{tr("Response time")}</h4>
              <p>{tr("We reply to every enquiry within one business day.")}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
