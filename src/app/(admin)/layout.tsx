import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "DevelMo Admin", template: "%s | DevelMo Admin" },
  robots: { index: false, follow: false },
};

// The admin console is LTR English only by decision (brief §3.9); the locale
// cookie must not flip it to RTL. The theme attribute is the hook for the
// per-user themes that land with the shell in Phase 3.
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="adm-root" dir="ltr" data-admin-theme="develmo-light">
      {children}
    </div>
  );
}
