import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { NavigationEditor } from "@/app/(admin)/_components/content/NavigationEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getNavigation, publicRoutePaths } from "@/lib/admin/content";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Navigation" };

// The mega menu's structure and ordering (brief §3.9), with a guard that
// refuses to save a menu containing a link to a route that does not resolve.
export default async function NavigationPage() {
  const { allows } = await requirePageUser("/admin/content/navigation", { permission: "content:read" });
  const [csrf, nav, routes] = await Promise.all([getCsrfToken(), getNavigation(), publicRoutePaths()]);
  return (
    <>
      <PageHeader kicker="Site content" title="Navigation" description="The header links and their order. A link to a page that does not exist is refused rather than saved." />
      <ContentNav />
      <NavigationEditor initial={nav} routes={routes} csrf={csrf} canWrite={allows("content:write")} />
    </>
  );
}
