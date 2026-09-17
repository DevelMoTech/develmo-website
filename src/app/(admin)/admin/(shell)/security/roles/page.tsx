import type { Metadata } from "next";
import { RoleAccessForm } from "@/app/(admin)/_components/security/RoleAccessForm";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { SECURITY_PERMISSION } from "@/lib/admin/security";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { getRoleAccess } from "@/lib/auth/role-access";
import { DEFAULT_ROLE_ACCESS } from "@/lib/schemas/security";

export const metadata: Metadata = { title: "Roles and access" };

// The per-role feature grid. Owner and Admin can see it; changing it also
// needs the settings permission, which the route handler checks again.
export default async function RolesPage() {
  const { allows } = await requirePageUser("/admin/security/roles", { permission: SECURITY_PERMISSION });
  const [csrf, access] = await Promise.all([getCsrfToken(), getRoleAccess()]);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Roles and access"
        description="Which console features each role may use. A change applies on the next page load, everywhere, with no restart and no deploy."
      />
      <SecurityNav />
      <RoleAccessForm initial={access} shipped={DEFAULT_ROLE_ACCESS} csrf={csrf} canChange={allows("settings:write")} />
    </>
  );
}
