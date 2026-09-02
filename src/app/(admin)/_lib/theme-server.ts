import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth/current";
import { THEME_COOKIE, THEME_STORAGE_KEY, isTheme, type ThemeId } from "./theme";

// Database first (the signed-in user's preference), then the cookie mirror
// (no flash on a device that has chosen before), then System.
export async function resolveTheme(): Promise<{ theme: ThemeId; source: "user" | "cookie" | "default" }> {
  const auth = await getCurrentSession();
  if (auth && !auth.session.mfaPending && isTheme(auth.user.themePref)) return { theme: auth.user.themePref, source: "user" };
  const c = (await cookies()).get(THEME_COOKIE)?.value;
  if (isTheme(c)) return { theme: c, source: "cookie" };
  return { theme: "system", source: "default" };
}

// Same pattern as the public layout's no-flash script: runs before paint and
// only fills in when the server had nothing to go on.
export const THEME_NO_FLASH_SCRIPT = `(function(){try{var r=document.currentScript.parentNode;if(r.getAttribute('data-admin-theme-source')!=='default')return;var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t&&/^[a-z-]+$/.test(t)){r.setAttribute('data-admin-theme',t);}}catch(e){}})();`;
