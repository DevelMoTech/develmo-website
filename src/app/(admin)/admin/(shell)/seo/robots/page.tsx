import type { Metadata } from "next";
import { RobotsEditor } from "@/app/(admin)/_components/seo/RobotsEditor";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getRobots } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "robots.txt" };

// robots.txt editor (brief §3.6) with a validity check and the hard rule,
// applied in code when the file is served, that /admin and /api/admin stay
// disallowed whatever is typed here.
export default async function RobotsPage() {
  const { user } = await requirePageUser("/admin/seo/robots", { permission: "seo:read" });
  const [csrf, robots] = await Promise.all([getCsrfToken(), getRobots()]);
  return (
    <>
      <PageHeader kicker="SEO" title="robots.txt" description={`What crawlers read at ${site.url}/robots.txt. The console and its API are disallowed in every group by a rule in code, not by this text.`} />
      <SeoNav />
      <RobotsEditor initial={robots.body} rendered={robots.rendered} csrf={csrf} canWrite={can(user.role, "seo:write")} robotsUrl={`${site.url}/robots.txt`} />
    </>
  );
}
