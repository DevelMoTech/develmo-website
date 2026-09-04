import type { Metadata } from "next";
import { headers } from "next/headers";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { HeadersViewer } from "@/app/(admin)/_components/security/HeadersViewer";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { checkHeaders, SECURITY_PERMISSION } from "@/lib/admin/security";
import { requestBaseUrl } from "@/lib/auth/api";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Response headers" };

// Read only (brief §3.7): the live headers, graded, never changed from here.
export default async function HeadersPage() {
  await requirePageUser("/admin/security/headers", { permission: SECURITY_PERMISSION });
  const [csrf, h] = await Promise.all([getCsrfToken(), headers()]);
  const initial = await checkHeaders(requestBaseUrl(h), "/");
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Response headers"
        description="What this deployment actually sends, graded against the securityheaders.com rules. This panel is read only: the policy is deployed with the code in next.config.ts."
      />
      <SecurityNav />
      <HeadersViewer csrf={csrf} initial={initial} />
    </>
  );
}
