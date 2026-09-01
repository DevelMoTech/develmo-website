import Link from "next/link";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

type Crumb = { label: string; href?: string };

export async function PageHero({
  title,
  subtitle,
  crumbs,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
}) {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <section className="phero">
      <div className="container">
        {crumbs && crumbs.length > 0 && (
          <div className="crumb">
            {crumbs.map((c, i) => (
              <span key={i}>
                {c.href ? <Link href={c.href}>{tr(c.label)}</Link> : tr(c.label)}
                {i < crumbs.length - 1 ? " / " : ""}
              </span>
            ))}
          </div>
        )}
        <h1>{tr(title)}</h1>
        {subtitle && <p>{tr(subtitle)}</p>}
      </div>
    </section>
  );
}
