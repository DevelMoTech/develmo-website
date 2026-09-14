import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/app/(admin)/_components/AuthCard";
import { LogoutButton } from "@/app/(admin)/_components/LogoutButton";
import { MfaVerifyForm } from "@/app/(admin)/_components/MfaVerifyForm";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { getMfaPolicy, stillPending } from "@/lib/auth/policy";
import { nextPathSchema } from "@/lib/schemas/auth";

export const metadata: Metadata = { title: "Two-factor check" };

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = nextPathSchema.parse(sp.next ?? "/admin");
  const { session } = await requirePageUser("/admin/mfa/verify", { allowMfaPending: true });
  if (!stillPending(await getMfaPolicy(), session.mfaPending)) redirect(next);
  const csrf = await getCsrfToken();
  return (
    <AuthCard title="Two-factor check" lead="Confirm it is you before continuing.">
      <MfaVerifyForm csrf={csrf} next={next} />
      <div className="adm-auth-links">
        <LogoutButton csrf={csrf} label="Cancel and sign out" />
      </div>
    </AuthCard>
  );
}
