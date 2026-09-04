// Client-safe i18n helpers (no next/headers import). Server cookie reading lives in i18n-server.ts.
import { uiMessages, contentLocale } from "@/lib/i18n/data";
import { extraMessages } from "@/lib/i18n/extra";
import { overrideFor } from "@/lib/i18n/overrides";

export const locales = ["en", "ar", "ur", "fr", "es"] as const;
export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  ur: "اردو",
  fr: "Français",
  es: "Español",
};

const RTL = new Set<string>(["ar", "ur"]);
export function isRtl(l: string): boolean {
  return RTL.has(l);
}

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (locales as readonly string[]).includes(v);
}

// Translate a UI/chrome string. English passes through; unknown strings fall
// back to English. Lookup order (brief §3.9): a database override saved in the
// console, then the generated uiMessages, then extraMessages, then English.
// With no overrides loaded the first step yields nothing and the order is
// exactly what it was before, so no currently translated string regresses.
export function t(text: string, locale: string): string {
  if (locale === "en") return text;
  return overrideFor(locale, text) ?? uiMessages[locale]?.[text] ?? extraMessages[locale]?.[text] ?? text;
}

// Merge an English content object with its locale override (by type + key).
export function loc<T extends Record<string, unknown>>(
  base: T,
  locale: string,
  type: string,
  key: string,
): T {
  if (locale === "en") return base;
  const o = contentLocale[locale]?.[type]?.[key];
  return o ? ({ ...base, ...o } as T) : base;
}
