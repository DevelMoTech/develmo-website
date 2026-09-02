import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../../_components/AuthCard";
import { ForgotPasswordForm } from "../../_components/ForgotPasswordForm";
import { getCsrfToken } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const csrf = await getCsrfToken();
  return (
    <AuthCard title="Reset your password" lead="Enter your email and we will send a single use reset link.">
      <ForgotPasswordForm csrf={csrf} />
      <div className="adm-auth-links">
        <Link href="/admin/login">Back to sign in</Link>
      </div>
    </AuthCard>
  );
}
