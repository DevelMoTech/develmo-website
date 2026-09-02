import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageUser("/admin/settings", { permission: "settings:read" });
  const c = await moduleCounts();
  return (
    <ModuleOverview
      kicker="Administration"
      title="Settings"
      description="Site facts, contact recipients, email templates, notification preferences, retention windows and feature toggles."
      icon="settings"
      stats={[
        { label: "Stored settings", value: c.settings, hint: "code defaults apply for the rest" },
        { label: "Rate limit overrides", value: c.rateLimitOverrides, hint: "defaults: login 5 per 10 min, contact 5 per min" },
      ]}
      empty={{
        title: "Everything is on its default",
        body: "No setting has been changed from the code defaults. Values saved here take effect without a deploy.",
      }}
    />
  );
}
