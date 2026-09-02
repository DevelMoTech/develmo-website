import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

// 404 for closed, paused, not-yet-open, draft and unknown roles alike (brief
// §3.4 asks for 410 or 404, documented: 404). One page for all of them means
// a URL never reveals whether a draft exists.
export default async function JobNotFound() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <PageHero
        title="This role is no longer open."
        subtitle="It may have closed or been filled. Our open roles are listed on the careers page."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Careers", href: "/jobs" },
        ]}
      />
      <section className="section">
        <div className="container">
          <Link href="/jobs" className="btn btn-teal btn-lg">
            {tr("See open roles")}
          </Link>
        </div>
      </section>
    </>
  );
}
