import { Shell } from "@/app/(admin)/_components/shell/Shell";
import { Notifications } from "@/app/(admin)/_components/shell/Notifications";
import { ThemeSwitcher } from "@/app/(admin)/_components/shell/ThemeSwitcher";
import { UserMenu } from "@/app/(admin)/_components/shell/UserMenu";
import { recentNotifications } from "@/app/(admin)/_lib/stats";
import { visibleGroups } from "@/app/(admin)/_lib/nav";
import { resolveTheme } from "@/app/(admin)/_lib/theme-server";
import { getCsrfToken, getCurrentSession } from "@/lib/auth/current";

// Wraps every authenticated console page in the shell. When there is no
// usable session the children render bare and the page's own gate redirects
// (keeping its ?next= behaviour), so this layout never redirects itself.
export default async function ShellLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await getCurrentSession();
  if (!auth || auth.session.mfaPending) return <>{children}</>;
  const { user } = auth;
  const [csrf, { theme }, notifications] = await Promise.all([getCsrfToken(), resolveTheme(), recentNotifications(user.role)]);
  return (
    <Shell
      groups={visibleGroups(user.role)}
      tools={
        <>
          <ThemeSwitcher csrf={csrf} initial={theme} />
          <Notifications items={notifications.items} unread={notifications.unread} />
          <UserMenu csrf={csrf} name={user.name} email={user.email} role={user.role} />
        </>
      }
    >
      {children}
    </Shell>
  );
}
