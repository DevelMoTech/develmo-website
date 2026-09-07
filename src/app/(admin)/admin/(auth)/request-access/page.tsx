import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/app/(admin)/_components/AuthCard";
import { RequestAccessForm } from "@/app/(admin)/_components/RequestAccessForm";

export const metadata: Metadata = { title: "Request access", robots: { index: false, follow: false } };

// Public, but it grants nothing. The form creates a queue entry an Owner or
// Admin decides on; approval sends the same single-use invite that
// /admin/users sends by hand, so every account still arrives one way.
export default function RequestAccessPage() {
  return (
    <AuthCard
      title="Request access"
      lead="The console is invite only. Tell us who you are and someone will decide, usually within a working day."
    >
      <RequestAccessForm />
      <div className="adm-auth-links">
        <Link href="/admin/login">Already have an account? Sign in</Link>
      </div>
    </AuthCard>
  );
}
