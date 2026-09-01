import Link from "next/link";
import { Button } from "@/components/ui";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export default async function NotFound() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <section className="phero" style={{ minHeight: "60vh", display: "flex", alignItems: "center" }}>
      <div className="container" style={{ textAlign: "center" }}>
        <div className="kicker" style={{ justifyContent: "center" }}>
          {tr("Error 404")}
        </div>
        <h1>{tr("This page took a wrong turn")}</h1>
        <p style={{ margin: "16px auto 0" }}>
          {tr("The page you are looking for does not exist or has moved. Let us get you back on track.")}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <Button href="/" variant="teal" lg>
            {tr("Back to home")}
          </Button>
          <Link className="btn btn-ghost btn-rect btn-lg" href="/contact-develmo">
            {tr("Contact us")}
          </Link>
        </div>
      </div>
    </section>
  );
}
