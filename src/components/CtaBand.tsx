import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function CtaBand({
  title,
  titleText,
  text = "Book a free consultation and we will map the highest-impact AI, automation or product opportunity for your team.",
  primaryLabel = "Book a Free Consultation",
  primaryHref = "/contact-develmo",
}: {
  title?: ReactNode;
  titleText?: string;
  text?: string;
  primaryLabel?: string;
  primaryHref?: string;
}) {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const heading =
    locale === "en"
      ? title ?? (
          <>
            Let&apos;s build AI that <span className="hl">fits</span> your business
          </>
        )
      : titleText
        ? tr(titleText)
        : tr("Let's build AI that fits your business.");
  return (
    <section className="section">
      <div className="container">
        <div className="cta-band">
          <h2>{heading}</h2>
          <p>{tr(text)}</p>
          <div className="row">
            <Button href={primaryHref} variant="teal" lg>
              {tr(primaryLabel)}
            </Button>
            <Button href="mailto:info@develmo.com" variant="ghost" rect lg>
              info@develmo.com
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
