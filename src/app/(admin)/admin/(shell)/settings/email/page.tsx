import type { Metadata } from "next";
import { EmailSettings } from "@/app/(admin)/_components/EmailSettings";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getSetting } from "@/lib/admin/settings";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { emailDeliveryStatus } from "@/lib/notify";

export const metadata: Metadata = { title: "Email delivery" };

export default async function EmailSettingsPage() {
  const { allows } = await requirePageUser("/admin/settings/email", { permission: "settings:read" });
  const [csrf, access] = await Promise.all([getCsrfToken(), getSetting("access_requests")]);
  return (
    <>
      <PageHeader
        kicker="Settings"
        title="Email delivery"
        description="Who is told when someone asks for console access, which channels can carry the message, and a real test to prove it."
      />
      <EmailSettings csrf={csrf} notifyEmail={access.notifyEmail} status={emailDeliveryStatus()} canWrite={allows("settings:write")} />
    </>
  );
}
