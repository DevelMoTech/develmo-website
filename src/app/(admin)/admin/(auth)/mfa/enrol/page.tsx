import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/app/(admin)/_components/AuthCard";
import { LogoutButton } from "@/app/(admin)/_components/LogoutButton";
import { MfaEnrolForm } from "@/app/(admin)/_components/MfaEnrolForm";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { beginTotpEnrolment } from "@/lib/auth/flows";
import { getMfaPolicy, mfaRequiredUnder } from "@/lib/auth/policy";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function MfaEnrolPage() {
  const { user } = await requirePageUser("/admin/mfa/enrol", { allowMfaUnenrolled: true });
  // Already enrolled: turning it off first lives on the account page.
  if (user.totpEnabled) redirect("/admin/account");
  const [{ secret, qr }, csrf, policy] = await Promise.all([beginTotpEnrolment(user), getCsrfToken(), getMfaPolicy()]);
  const required = mfaRequiredUnder(policy, user.role);
  return (
    <AuthCard
      title="Set up two-factor authentication"
      lead={
        required
          ? `Two-factor authentication is required for the ${user.role} role.`
          : policy === "off"
            ? "The console is not asking for second factors at the moment. What you set up here is kept, and asked for once that changes."
            : "Add a second step to protect your account. You will be asked for a code from the app at every sign in."
      }
    >
      <MfaEnrolForm csrf={csrf} qr={qr} secret={secret} email={user.email} />
      <div className="adm-auth-links">
        {!required && <a href="/admin/account">Not now</a>}
        <LogoutButton csrf={csrf} label="Sign out" />
      </div>
    </AuthCard>
  );
}
