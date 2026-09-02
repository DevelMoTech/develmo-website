import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Site content" };

export default async function ContentPage() {
  await requirePageUser("/admin/content", { permission: "content:read" });
  const c = await moduleCounts();
  const g = (k: string) => c.content[k] ?? 0;
  return (
    <ModuleOverview
      kicker="Content"
      title="Site content"
      description="The structured content behind the public pages, seeded from the typed files in src/lib and served through the repository layer."
      icon="content"
      stats={[
        { label: "Service pillars", value: g("pillar") },
        { label: "Services", value: g("service") },
        { label: "Industries", value: g("industry") },
        { label: "Products", value: g("product") },
        { label: "About pages", value: g("about") },
        { label: "Site facts", value: g("site") + g("stats") + g("tech"), hint: "company, stats, tech" },
      ]}
    />
  );
}
