import type { Metadata } from "next";
import Link from "next/link";
import { AdminBar } from "../../_components/AdminBar";
import { ChangeEmailForm, ChangePasswordForm, MfaResetForm, ProfileForm, SessionsList, type SessionView } from "../../_components/AccountForms";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { recoveryCodesRemaining } from "@/lib/auth/flows";
import { mfaRequired } from "@/lib/auth/rbac";
import { listActiveSessions } from "@/lib/auth/session";
import { describeUserAgent } from "@/lib/auth/ua";

export const metadata: Metadata = { title: "Account" };

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ required?: string; email?: string }> }) {
  const { user, session } = await requirePageUser("/admin/account", { allowMustChangePassword: true, allowMfaUnenrolled: true });
  const sp = await searchParams;
  const csrf = await getCsrfToken();
  const sessions = await listActiveSessions(user.id);
  const codesLeft = user.totpEnabled ? await recoveryCodesRemaining(user.id) : 0;
  const rows: SessionView[] = sessions.map((s) => ({
    id: s.id,
    current: s.id === session.id,
    device: describeUserAgent(s.userAgent),
    userAgent: s.userAgent ?? "",
    ipHash: s.ipHash ?? "",
    lastSeenAt: fmt(s.lastSeenAt),
    createdAt: fmt(s.createdAt),
  }));
  const mustChange = user.mustChangePassword || sp.required === "password";
  const needsEnrol = mfaRequired(user.role) && !user.totpEnabled && !user.mustChangePassword;

  return (
    <>
      <AdminBar csrf={csrf} role={user.role} current="/admin/account" />
      <main className="adm-page" id="main">
        <div className="adm-page-head">
          <div>
            <div className="adm-kicker">Account</div>
            <h1>{user.name}</h1>
          </div>
          <span className="adm-badge">{user.role}</span>
        </div>

        {mustChange && (
          <div className="adm-alert adm-alert-warn" role="alert">
            <p>You are using a temporary password. Set a new one below before continuing.</p>
          </div>
        )}
        {needsEnrol && (
          <div className="adm-alert adm-alert-warn" role="alert">
            <p>
              Two-factor authentication is required for your role. <Link href="/admin/mfa/enrol">Set it up now</Link>.
            </p>
          </div>
        )}
        {sp.email === "failed" && (
          <div className="adm-alert adm-alert-error" role="alert">
            <p>That email confirmation link is not valid any more. Request the change again if you still want it.</p>
          </div>
        )}

        <div className="adm-grid">
          <section className="adm-card" aria-labelledby="acc-password">
            <h2 id="acc-password">Password</h2>
            <p>Changing your password signs out every other session.</p>
            <ChangePasswordForm csrf={csrf} required={mustChange} />
          </section>

          <section className="adm-card" aria-labelledby="acc-mfa">
            <h2 id="acc-mfa">Two-factor authentication</h2>
            {user.totpEnabled ? (
              <>
                <p>On. {codesLeft} recovery code{codesLeft === 1 ? "" : "s"} left.</p>
                <div style={{ marginBlockStart: 14 }}>
                  <MfaResetForm csrf={csrf} />
                </div>
              </>
            ) : (
              <>
                <p>{mfaRequired(user.role) ? "Required for your role." : "Optional for your role, recommended."}</p>
                <div className="adm-actions" style={{ marginBlockStart: 14 }}>
                  <Link className="adm-btn adm-btn-primary adm-btn-sm" href="/admin/mfa/enrol">Set up authenticator</Link>
                </div>
              </>
            )}
          </section>

          <section className="adm-card" aria-labelledby="acc-profile">
            <h2 id="acc-profile">Profile</h2>
            <p>How your name appears in the audit log and to other staff.</p>
            <ProfileForm csrf={csrf} name={user.name} />
          </section>

          <section className="adm-card" aria-labelledby="acc-email">
            <h2 id="acc-email">Email address</h2>
            <p>Your sign in address. Confirmed by a link sent to the new address.</p>
            <ChangeEmailForm csrf={csrf} email={user.email} />
          </section>
        </div>

        <section className="adm-card" aria-labelledby="acc-sessions" style={{ marginBlockStart: 18 }}>
          <h2 id="acc-sessions">Active sessions</h2>
          <p>Every device currently signed in to your account. IPs are stored only as a salted hash.</p>
          <SessionsList csrf={csrf} sessions={rows} />
        </section>
      </main>
    </>
  );
}
