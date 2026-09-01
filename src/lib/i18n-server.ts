import "server-only";
import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/lib/i18n";

// Reads the active locale from the `locale` cookie (set by the Languages switcher).
export async function getLocale(): Promise<Locale> {
  try {
    const c = await cookies();
    const v = c.get("locale")?.value;
    if (isLocale(v)) return v;
  } catch {}
  return "en";
}
