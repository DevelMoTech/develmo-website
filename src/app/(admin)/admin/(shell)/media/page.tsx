import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  await requirePageUser("/admin/media", { permission: "media:read" });
  const c = await moduleCounts();
  return (
    <ModuleOverview
      kicker="Content"
      title="Media"
      description="Images and files used by posts, jobs and pages. Uploads are stored outside the repository with unguessable keys."
      icon="media"
      stats={[{ label: "Files in the library", value: c.media }]}
      empty={{
        title: "The library is empty",
        body: "Files uploaded from the post and job editors will appear here with alt text, usage and replace controls.",
      }}
    />
  );
}
