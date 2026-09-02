import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../../_components/AuthCard";
import { SignupForm } from "../../_components/SignupForm";
import { getCsrfToken } from "@/lib/auth/current";
import { checkInviteToken, type InviteFailure } from "@/lib/auth/flows";
import { tokenQuerySchema } from "@/lib/schemas/auth";

export const metadata: Metadata = { title: "Accept invitation" };

const FAILURES: Record<InviteFailure | "missing", { title: string; body: string }> = {
  missing: { title: "Invitation link missing", body: "This page only works from the link in your invitation email. Ask the person who invited you to send it again." },
  malformed: { title: "Invitation link not recognised", body: "The link is incomplete or has been altered. Open the link from your invitation email again, or ask for a new invitation." },
  expired: { title: "Invitation expired", body: "Invitations are valid for 72 hours. Ask the person who invited you to send a new one." },
  used: { title: "Invitation already used", body: "An account has already been created from this invitation. Sign in instead, or reset your password if you have forgotten it." },
  revoked: { title: "Invitation withdrawn", body: "This invitation has been revoked. Contact the person who invited you." },
};

// Invite-only: this page never renders a form without a valid single-use token.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const parsed = tokenQuerySchema.safeParse(sp.token ?? "");
  let failure: InviteFailure | "missing" | null = null;
  let invite: { email: string; role: string } | null = null;
  if (!sp.token) failure = "missing";
  else if (!parsed.success) failure = "malformed";
  else {
    const check = await checkInviteToken(parsed.data);
    if (check.ok) invite = { email: check.email, role: check.role };
    else failure = check.reason;
  }

  if (failure || !invite || !parsed.success) {
    const f = FAILURES[failure ?? "malformed"];
    return (
      <AuthCard title={f.title}>
        <div className="adm-alert adm-alert-error" role="alert">
          <p>{f.body}</p>
        </div>
        <div className="adm-auth-links">
          <Link href="/admin/login">Sign in</Link>
          <Link href="/admin/forgot-password">Reset password</Link>
        </div>
      </AuthCard>
    );
  }

  const csrf = await getCsrfToken();
  return (
    <AuthCard title="Create your account" lead={`You have been invited to the DevelMo console as ${invite.role}.`}>
      <SignupForm csrf={csrf} token={parsed.data} email={invite.email} />
    </AuthCard>
  );
}
