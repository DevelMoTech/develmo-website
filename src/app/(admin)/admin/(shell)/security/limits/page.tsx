import type { Metadata } from "next";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { RateLimits, TurnstileForm } from "@/app/(admin)/_components/security/LimitsManager";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getTurnstile, listRateLimits, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Rate limits" };

// Per-endpoint limits and the Turnstile toggle (brief §3.7).
export default async function LimitsPage() {
  await requirePageUser("/admin/security/limits", { permission: SECURITY_PERMISSION });
  const [csrf, limits, turnstile] = await Promise.all([getCsrfToken(), listRateLimits(), getTurnstile()]);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Rate limits"
        description="Per endpoint limits, counted durably so they hold across instances. A change is read by the limiter within 30 seconds, with no restart and no deploy."
      />
      <SecurityNav />
      <RateLimits rows={limits} csrf={csrf} />
      <TurnstileForm initial={turnstile} csrf={csrf} />
    </>
  );
}
