import type { Metadata } from "next";
import { AdminBar } from "../../_components/AdminBar";
import { InviteForm, InvitesTable, UsersTable, type InviteView, type UserView } from "../../_components/UsersAdmin";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { listInvites, listUsers } from "@/lib/auth/flows";
import { can, invitableRoles } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Users" };

function fmt(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Never";
}

export default async function UsersPage() {
  const { user } = await requirePageUser("/admin/users", { permission: "users:read" });
  const csrf = await getCsrfToken();
  const canManage = can(user.role, "users:manage");
  const [users, invites] = await Promise.all([listUsers(), canManage ? listInvites() : Promise.resolve([])]);

  const userRows: UserView[] = users.map((u) => ({
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

  return (
    <>
      <AdminBar csrf={csrf} role={user.role} current="/admin/users" />
      <main className="adm-page" id="main">
        <div className="adm-page-head">
          <div>
            <div className="adm-kicker">Access</div>
            <h1>Users</h1>
          </div>
          <span className="adm-badge adm-badge-muted">{users.length} account{users.length === 1 ? "" : "s"}</span>
        </div>

        <section className="adm-card" aria-labelledby="users-list">
          <h2 id="users-list">Staff accounts</h2>
          <p>Owners cannot be demoted or removed by anyone else, and at least one Owner always exists.</p>
          <UsersTable csrf={csrf} users={userRows} canManage={canManage} actorRole={user.role} />
        </section>

        {canManage && (
          <div className="adm-grid" style={{ marginBlockStart: 18 }}>
            <section className="adm-card" aria-labelledby="users-invite">
              <h2 id="users-invite">Invite someone</h2>
              <p>Access is invite only. The link works once and expires after 72 hours.</p>
              <InviteForm csrf={csrf} roles={invitableRoles(user.role)} />
            </section>
            <section className="adm-card" aria-labelledby="users-invites">
              <h2 id="users-invites">Open invitations</h2>
              <p>Resend issues a fresh link and expiry; revoke cancels the invitation.</p>
              <InvitesTable csrf={csrf} invites={inviteRows} />
            </section>
          </div>
        )}
      </main>
    </>
  );
}
