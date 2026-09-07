import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/app/(admin)/_components/AuthCard";
import { LoginForm } from "@/app/(admin)/_components/LoginForm";
import { getCsrfToken, getCurrentSession } from "@/lib/auth/current";
import { nextPathSchema } from "@/lib/schemas/auth";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  reset: "Your password has been reset. Sign in with your new password.",
  signed_out: "You have been signed out.",
  expired: "Your session has ended. Sign in again to continue.",
  email_changed: "Your email address has been updated. Sign in with the new address.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const next = nextPathSchema.parse(sp.next ?? "/admin");
  const auth = await getCurrentSession();
  if (auth && !auth.session.mfaPending) redirect(next);
  const csrf = await getCsrfToken();
  const notice = sp.notice ? NOTICES[sp.notice] : undefined;

  return (
    <AuthCard title="Sign in" lead="Staff access to the DevelMo console.">
      {notice && (
        <div className="adm-alert adm-alert-info" role="status">
          <p>{notice}</p>
        </div>
      )}
      <LoginForm csrf={csrf} next={next} />
      <div className="adm-auth-links">
        <Link href="/admin/forgot-password">Forgot your password?</Link>
        <Link href="/admin/request-access">Need an account? Request access</Link>
      </div>
    </AuthCard>
  );
}
