import { PageHero } from "@/components/PageHero";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export type LegalSection = { h: string; p: string[] };

export async function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  const locale = await getLocale();
  // Legal copy is authored in English; render it LTR even inside an RTL
  // document, with a short translated notice so non-English readers know.
  return (
    <>
      <PageHero
        title={title}
        subtitle={`Last updated: ${updated}`}
        crumbs={[{ label: t("Home", locale), href: "/" }, { label: title }]}
      />
      <section className="section">
        <div className="container">
          <div className="prose" dir="ltr" style={{ maxWidth: 820, textAlign: "left" }}>
            {locale !== "en" && (
              <p
                style={{
                  padding: "12px 16px",
                  background: "var(--tint)",
                  borderRadius: 10,
                  fontSize: 14,
                  color: "var(--muted)",
                }}
              >
                {t(
                  "This policy is provided in English. Contact us if you need it in another language.",
                  locale,
                )}
              </p>
            )}
            <p>{intro}</p>
            {sections.map((s, i) => (
              <div key={i}>
                <h2>{s.h}</h2>
                {s.p.map((x, j) => (
                  <p key={j}>{x}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
