import type { Metadata } from "next";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { SessionsPanel, UsersPanel } from "@/app/(admin)/_components/security/SessionsManager";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listActiveSessions, listUsersForOversight, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getCsrfToken, getCurrentSession, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Sessions" };

// Session and user oversight (brief §3.7).
export default async function SessionsPage() {
  const auth = await requirePageUser("/admin/security/sessions", { permission: SECURITY_PERMISSION });
  const current = await getCurrentSession();
  const [csrf, sessions, users] = await Promise.all([getCsrfToken(), listActiveSessions(current?.session.id ?? ""), listUsersForOversight()]);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Sessions and accounts"
        description="Every active session across every account, and the account level controls. Revoking a session signs that browser out on its next request."
      />
      <SecurityNav />
      <SessionsPanel sessions={sessions} csrf={csrf} />
      <UsersPanel users={users} csrf={csrf} actorId={auth.user.id} actorRole={auth.user.role} />
    </>
  );
}
