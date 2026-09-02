import type { Metadata } from "next";
import Link from "next/link";
import { AdminBar } from "../_components/AdminBar";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { recoveryCodesRemaining } from "@/lib/auth/flows";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Home" };

const DENIED: Record<string, string> = {
  "users:read": "You do not have access to user management.",
};

// Signed-in landing page. The dashboard tiles (submissions, posts, jobs,
// vitals, security, health, activity) arrive with their modules from Phase 3.
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { user, session } = await requirePageUser("/admin");
  const sp = await searchParams;
  const csrf = await getCsrfToken();
  const codesLeft = user.totpEnabled ? await recoveryCodesRemaining(user.id) : null;
  const denied = sp.denied ? (DENIED[sp.denied] ?? "You do not have permission to open that page.") : null;

  return (
    <>
      <AdminBar csrf={csrf} role={user.role} current="/admin" />
      <main className="adm-page" id="main">
        <div className="adm-page-head">
          <div>
            <div className="adm-kicker">DevelMo console</div>
            <h1>Welcome, {user.name}</h1>
          </div>
          <span className="adm-badge">{user.role}</span>
        </div>
        {denied && (
          <div className="adm-alert adm-alert-warn" role="alert">
            <p>{denied}</p>
          </div>
        )}
        <div className="adm-grid">
          <section className="adm-card" aria-labelledby="home-account">
            <h2 id="home-account">Your account</h2>
            <p>Profile, password, two-factor authentication and active sessions.</p>
            <dl className="adm-dl">
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Two-factor</dt>
              <dd>{user.totpEnabled ? `On, ${codesLeft} recovery codes left` : "Off"}</dd>
              <dt>This session</dt>
              <dd>Signed in {session.createdAt.toUTCString()}</dd>
            </dl>
            <div className="adm-actions" style={{ marginBlockStart: 16 }}>
              <Link className="adm-btn adm-btn-ghost adm-btn-sm" href="/admin/account">Manage account</Link>
            </div>
          </section>
          {can(user.role, "users:read") && (
            <section className="adm-card" aria-labelledby="home-users">
              <h2 id="home-users">Users</h2>
              <p>Staff accounts, roles and invitations. Access is invite only.</p>
              <div className="adm-actions" style={{ marginBlockStart: 16 }}>
                <Link className="adm-btn adm-btn-ghost adm-btn-sm" href="/admin/users">Open users</Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
