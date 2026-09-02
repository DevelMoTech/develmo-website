import type { Metadata } from "next";
import Link from "next/link";
import { ChangeEmailForm, ChangePasswordForm, MfaResetForm, ProfileForm, SessionsList, type SessionView } from "@/app/(admin)/_components/AccountForms";
import { Alert, Badge, Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { Tabs } from "@/app/(admin)/_components/ui/Tabs";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { recoveryCodesRemaining } from "@/lib/auth/flows";
import { mfaRequired } from "@/lib/auth/rbac";
import { listActiveSessions } from "@/lib/auth/session";
import { describeUserAgent } from "@/lib/auth/ua";

export const metadata: Metadata = { title: "Account" };

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ required?: string; email?: string; tab?: string }> }) {
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
  const initialTab = mustChange || needsEnrol ? "security" : sp.tab;

  return (
    <>
      <PageHeader kicker="Account" title={user.name} description={user.email} actions={<Badge>{user.role}</Badge>} />
      {mustChange && <Alert kind="warn">You are using a temporary password. Set a new one below before continuing.</Alert>}
      {needsEnrol && (
        <Alert kind="warn">
          <p>Two-factor authentication is required for your role. <Link className="adm-link" href="/admin/mfa/enrol">Set it up now</Link>.</p>
        </Alert>
      )}
      {sp.email === "failed" && <Alert kind="error">That email confirmation link is not valid any more. Request the change again if you still want it.</Alert>}
      <div style={{ marginBlockStart: 18 }}>
        <Tabs
          param="tab"
          initial={initialTab}
          tabs={[
            {
              id: "profile",
              label: "Profile",
              content: (
                <div className="adm-grid">
                  <Card title="Profile">
                    <ProfileForm csrf={csrf} name={user.name} />
                  </Card>
                  <Card title="Email address" description="Your sign in address. Confirmed by a link sent to the new address.">
                    <ChangeEmailForm csrf={csrf} email={user.email} />
                  </Card>
                </div>
              ),
            },
            {
              id: "security",
              label: "Security",
              content: (
                <div className="adm-grid">
                  <Card title="Password" description="Changing your password signs out every other session.">
                    <ChangePasswordForm csrf={csrf} required={mustChange} />
                  </Card>
                  <Card title="Two-factor authentication">
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
                          <ButtonLink variant="primary" size="sm" href="/admin/mfa/enrol">Set up authenticator</ButtonLink>
                        </div>
                      </>
                    )}
                  </Card>
                </div>
              ),
            },
            {
              id: "sessions",
              label: `Sessions (${rows.length})`,
              content: (
                <Card title="Active sessions" description="Every device currently signed in to your account. IPs are stored only as a salted hash.">
                  <SessionsList csrf={csrf} sessions={rows} />
                </Card>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
