import type { Metadata } from "next";
import { MfaPolicyForm } from "@/app/(admin)/_components/security/AuthPolicyForm";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { secondFactorStats, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { getMfaPolicy } from "@/lib/auth/policy";

export const metadata: Metadata = { title: "Authentication" };

// The second-factor policy. Owner and Admin can see it; only the Owner can
// change it (settings:owner), enforced again in the route handler.
export default async function AuthenticationPage() {
  const { allows } = await requirePageUser("/admin/security/authentication", { permission: SECURITY_PERMISSION });
  const [csrf, policy, stats] = await Promise.all([getCsrfToken(), getMfaPolicy(), secondFactorStats()]);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Authentication"
        description="Whether the console asks for a second factor after the password, and for whom. Sessions, lockouts and rate limits are on the other tabs."
      />
      <SecurityNav />
      <MfaPolicyForm initial={policy} csrf={csrf} canChange={allows("settings:owner")} stats={stats} />
    </>
  );
}
