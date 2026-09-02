import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "../../../_components/AuthCard";
import { LogoutButton } from "../../../_components/LogoutButton";
import { MfaEnrolForm } from "../../../_components/MfaEnrolForm";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { beginTotpEnrolment } from "@/lib/auth/flows";
import { mfaRequired } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function MfaEnrolPage() {
  const { user } = await requirePageUser("/admin/mfa/enrol", { allowMfaUnenrolled: true });
  // Already enrolled: turning it off first lives on the account page.
  if (user.totpEnabled) redirect("/admin/account");
  const { secret, qr } = await beginTotpEnrolment(user);
  const csrf = await getCsrfToken();
  const required = mfaRequired(user.role);
  return (
    <AuthCard
      title="Set up two-factor authentication"
      lead={required ? `Two-factor authentication is required for the ${user.role} role.` : "Add a second step to protect your account."}
    >
      <MfaEnrolForm csrf={csrf} qr={qr} secret={secret} email={user.email} />
      <div className="adm-auth-links">
        {!required && <a href="/admin/account">Not now</a>}
        <LogoutButton csrf={csrf} label="Sign out" />
      </div>
    </AuthCard>
  );
}
