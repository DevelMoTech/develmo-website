import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { SiteFactsEditor } from "@/app/(admin)/_components/content/SiteFactsEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getSiteFacts, getStats, getTech } from "@/lib/admin/content";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import type { SiteFactsInput } from "@/lib/schemas/content";

export const metadata: Metadata = { title: "Company facts" };

// The company facts, offices, stats, tech and social links from
// src/lib/site.ts (brief §3.9).
export default async function SiteContentPage() {
  const { user } = await requirePageUser("/admin/content/site", { permission: "content:read" });
  const [csrf, facts, stats, tech] = await Promise.all([getCsrfToken(), getSiteFacts(), getStats(), getTech()]);
  return (
    <>
      <PageHeader kicker="Site content" title="Company facts" description="The name, address, contact details, offices, headline stats, technology list and social profiles the public site renders." />
      <ContentNav />
      <SiteFactsEditor
        facts={facts.facts as unknown as SiteFactsInput}
        stats={stats.value}
        tech={tech.value}
        fromFile={facts.fromFile}
        csrf={csrf}
        canWrite={can(user.role, "content:write")}
      />
    </>
  );
}
