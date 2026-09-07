import type { Metadata } from "next";
import { AccessRequests, type AccessRequestRow } from "@/app/(admin)/_components/AccessRequests";
import { InviteForm, InvitesTable, UsersTable, type InviteView, type UserView } from "@/app/(admin)/_components/UsersAdmin";
import { Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { listAccessRequests } from "@/lib/auth/access-requests";
import { listInvites, listUsers } from "@/lib/auth/flows";
import { can, invitableRoles } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Users" };

function fmt(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Never";
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requirePageUser("/admin/users", { permission: "users:read" });
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 160);
  const csrf = await getCsrfToken();
  const canManage = can(user.role, "users:manage");
  const [users, invites, accessRequests] = await Promise.all([listUsers(), canManage ? listInvites() : Promise.resolve([]), listAccessRequests()]);

  const userRows: UserView[] = users
    .filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      totpEnabled: u.totpEnabled,
      lastLoginAt: fmt(u.lastLoginAt),
      self: u.id === user.id,
    }));
  const inviteRows: InviteView[] = invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: fmt(i.expiresAt) }));
  const requestRows: AccessRequestRow[] = accessRequests.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    organisation: r.organisation,
    reason: r.reason,
    status: r.status,
    decidedBy: r.decidedBy,
    decidedAt: fmt(r.decidedAt),
    decisionNote: r.decisionNote,
    createdAt: fmt(r.createdAt),
  }));
  const pendingRequests = requestRows.filter((r) => r.status === "pending").length;

  return (
    <>
      <PageHeader
        kicker="Administration"
        title="Users"
        description="Staff accounts, roles and invitations. Access is invite only."
        actions={<Badge tone="muted">{users.length} account{users.length === 1 ? "" : "s"}</Badge>}
      />
      <Card title="Staff accounts" description={q ? `Filtered by “${q}”. ` : "Owners cannot be demoted or removed by anyone else, and at least one Owner always exists."}>
        {q && <p><a className="adm-link" href="/admin/users">Show all accounts</a></p>}
        <UsersTable csrf={csrf} users={userRows} canManage={canManage} actorRole={user.role} />
      </Card>
      {canManage && (
        <div className="adm-grid" style={{ marginBlockStart: 18 }}>
          <Card title="Invite someone" description="The link works once and expires after 72 hours.">
            <InviteForm csrf={csrf} roles={invitableRoles(user.role)} />
          </Card>
          <Card title="Open invitations" description="Resend issues a fresh link and expiry; revoke cancels the invitation.">
            <InvitesTable csrf={csrf} invites={inviteRows} />
          </Card>
        </div>
      )}
      <Card
        title="Access requests"
        description="Submitted from the public form at /admin/request-access. Approving sends the same single use invitation as above; declining sends no email."
        actions={pendingRequests > 0 ? <Badge tone="warn">{pendingRequests} waiting</Badge> : undefined}
      >
        <AccessRequests csrf={csrf} requests={requestRows} invitable={invitableRoles(user.role)} canManage={canManage} />
      </Card>
    </>
  );
}
