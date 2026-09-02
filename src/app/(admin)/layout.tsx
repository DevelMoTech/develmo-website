import type { Metadata } from "next";
import "./admin.css";
import { ToastProvider } from "./_components/ui/Toast";
import { THEME_NO_FLASH_SCRIPT, resolveTheme } from "./_lib/theme-server";

export const metadata: Metadata = {
  title: { default: "DevelMo Admin", template: "%s | DevelMo Admin" },
  robots: { index: false, follow: false },
};

// The admin console is LTR English only by decision (brief §3.9); the locale
// cookie must not flip it to RTL. Theme: database preference, then cookie
// mirror, then System; the inline script only fills in from localStorage
// when the server had nothing to go on, so there is never a flash.
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { theme, source } = await resolveTheme();
  return (
    <div className="adm-root" dir="ltr" data-admin-theme={theme} data-admin-theme-source={source} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
