import type { Metadata } from "next";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { MediaSettingsForm } from "@/app/(admin)/_components/performance/MediaSettingsForm";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getMediaSettings } from "@/lib/admin/performance";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Media settings" };

// Hero video behaviour (brief §3.8), read by HeroStage on the home page.
export default async function MediaPage() {
  const { allows } = await requirePageUser("/admin/performance/media", { permission: "performance:read" });
  const [csrf, settings] = await Promise.all([getCsrfToken(), getMediaSettings()]);
  return (
    <>
      <PageHeader
        kicker="Performance"
        title="Media settings"
        description="How the home page hero behaves. The three clips are the heaviest thing the site asks a visitor to download."
      />
      <PerformanceNav />
      <MediaSettingsForm initial={settings} csrf={csrf} canWrite={allows("performance:write")} />
    </>
  );
}
