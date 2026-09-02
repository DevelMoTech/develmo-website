import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/app/(admin)/_components/AuthCard";
import { ResetPasswordForm } from "@/app/(admin)/_components/ResetPasswordForm";
import { getCsrfToken } from "@/lib/auth/current";
import { checkResetToken } from "@/lib/auth/flows";
import { tokenQuerySchema } from "@/lib/schemas/auth";

export const metadata: Metadata = { title: "Set a new password" };

const FAILURES: Record<"missing" | "malformed" | "expired" | "used", { title: string; body: string }> = {
  missing: { title: "Reset link missing", body: "This page only works from the link in a password reset email." },
  malformed: { title: "Reset link not recognised", body: "The link is incomplete or has been altered. Request a new reset link." },
  expired: { title: "Reset link expired", body: "Reset links are valid for 60 minutes. Request a new one." },
  used: { title: "Reset link already used", body: "This link has already been used. If you did not reset your password, request a new link now." },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const parsed = tokenQuerySchema.safeParse(sp.token ?? "");
  let failure: keyof typeof FAILURES | null = null;
  if (!sp.token) failure = "missing";
  else if (!parsed.success) failure = "malformed";
  else {
    const check = await checkResetToken(parsed.data);
    if (!check.ok) failure = check.reason;
  }

  if (failure || !parsed.success) {
    const f = FAILURES[failure ?? "malformed"];
    return (
      <AuthCard title={f.title}>
        <div className="adm-alert adm-alert-error" role="alert">
          <p>{f.body}</p>
        </div>
        <div className="adm-auth-links">
          <Link href="/admin/forgot-password">Request a new link</Link>
          <Link href="/admin/login">Sign in</Link>
        </div>
      </AuthCard>
    );
  }

  const csrf = await getCsrfToken();
  return (
    <AuthCard title="Set a new password" lead="All other sessions on this account will be signed out.">
      <ResetPasswordForm csrf={csrf} token={parsed.data} />
    </AuthCard>
  );
}
