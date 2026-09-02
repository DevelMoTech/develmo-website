import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts, securityStats } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  await requirePageUser("/admin/security", { permission: "security:read" });
  const [s, c] = await Promise.all([securityStats(), moduleCounts()]);
  return (
    <ModuleOverview
      kicker="Site"
      title="Security"
      description="Authentication and abuse events, IP access control, runtime rate limits, response headers and dependency status."
      icon="shield"
      stats={[
        { label: "Events, 24 hours", value: s.total },
        { label: "Failed logins, 24 hours", value: s.failedLogins },
        { label: "Rate limit trips, 24 hours", value: s.rateLimited },
        { label: "Blocked IPs", value: s.blockedIps, hint: "active block rules" },
        { label: "Events, all time", value: c.securityEvents },
      ]}
    />
  );
}
