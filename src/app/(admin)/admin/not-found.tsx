import Link from "next/link";
import { EmptyState } from "@/app/(admin)/_components/ui/Basics";

// Without this, an unknown /admin path falls through to the root
// src/app/not-found.tsx, which renders the public site chrome inside the
// console. That boundary is also part of every admin page's render tree, so
// its footer logo was being preloaded on pages that never show it.
export default function AdminNotFound() {
  return (
    <main className="adm-auth">
      <div className="adm-auth-card">
        <EmptyState
          level={2}
          icon="alert"
          title="That page does not exist"
          body="The address may have changed, or the record may have been deleted."
          action={
            <Link className="adm-btn adm-btn-primary" href="/admin">
              Back to the dashboard
            </Link>
          }
        />
      </div>
    </main>
  );
}
