import type { Metadata } from "next";
import { AccessManager } from "@/app/(admin)/_components/security/AccessManager";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listAccessRules, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getClientIp } from "@/lib/auth/ip";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { headers } from "next/headers";
import { ACCESS_TTL_MS } from "@/lib/security/access";

export const metadata: Metadata = { title: "Access control" };

// IP and CIDR access control (brief §3.7), enforced in the proxy.
export default async function AccessPage() {
  await requirePageUser("/admin/security/access", { permission: SECURITY_PERMISSION });
  const [csrf, rules, h] = await Promise.all([getCsrfToken(), listAccessRules(), headers()]);
  const yourIp = getClientIp(h);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Access control"
        description={`A blocked address gets 403 on the whole site, before any page or API route runs. The proxy holds the rules in memory and refreshes them every ${ACCESS_TTL_MS / 1000} seconds, so a change takes hold within that window and no visitor request queries the database.`}
      />
      <SecurityNav />
      <AccessManager rules={rules} csrf={csrf} yourIp={yourIp} />
    </>
  );
}
