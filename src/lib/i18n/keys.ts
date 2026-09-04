import { uiMessages } from "@/lib/i18n/data";
import { extraMessages } from "@/lib/i18n/extra";
import { locales, type Locale } from "@/lib/i18n";

// The dictionary key space the translations manager works over (brief §3.9):
// every English source string that either generated file already translates.
// The files stay the seed and the fallback; the console writes overrides to
// the database and never touches extra.ts or data.ts.

export type KeySource = "ui" | "extra";

// The locales the translations manager edits. English is the source
// language and is never stored as an override.
export const EDITABLE_LOCALES = locales.filter((l) => l !== "en") as Exclude<Locale, "en">[];

// Decorative mono labels that are English by design (brief §3.9). They are
// not translated, are not missing, and must never be reported as a leak.
export const DECORATIVE_ENGLISH = [
  "// FEATURED",
  "// LET'S BUILD",
  "GLOBAL DELIVERY · LHR / SYD / RUH / KHI",
];

const decorative = new Set(DECORATIVE_ENGLISH);

export function isDecorative(key: string): boolean {
  return decorative.has(key.trim());
}

// Every key, with which file it came from. Built from the union of the two
// dictionaries across all non-English locales, so a key translated for only
// one locale still appears (and shows as missing for the others).
let cachedKeys: { key: string; source: KeySource }[] | null = null;

export function allKeys(): { key: string; source: KeySource }[] {
  if (cachedKeys) return cachedKeys;
  const sources = new Map<string, KeySource>();
  for (const locale of locales) {
    if (locale === "en") continue;
    for (const key of Object.keys(extraMessages[locale] ?? {})) if (!sources.has(key)) sources.set(key, "extra");
    for (const key of Object.keys(uiMessages[locale] ?? {})) if (!sources.has(key)) sources.set(key, "ui");
  }
  for (const key of decorative) sources.delete(key);
  cachedKeys = [...sources.entries()].map(([key, source]) => ({ key, source })).sort((a, b) => a.key.localeCompare(b.key));
  return cachedKeys;
}

// What the files translate this key to, before any database override.
export function fileValue(locale: string, key: string): string | undefined {
  return uiMessages[locale]?.[key] ?? extraMessages[locale]?.[key];
}

export type Coverage = { locale: Locale; total: number; translated: number; fromFile: number; fromDatabase: number; missing: number; percent: number };

// Per-locale coverage over the whole key space. A key counts as translated
// when either the files or an override supplies a value for it.
export function coverage(overrides: Record<string, Record<string, string>>): Coverage[] {
  const keys = allKeys();
  return locales
    .filter((l) => l !== "en")
    .map((locale) => {
      let fromFile = 0;
      let fromDatabase = 0;
      for (const { key } of keys) {
        const hasOverride = typeof overrides[locale]?.[key] === "string" && overrides[locale][key].trim() !== "";
        if (hasOverride) fromDatabase += 1;
        else if (typeof fileValue(locale, key) === "string") fromFile += 1;
      }
      const translated = fromFile + fromDatabase;
      return {
        locale,
        total: keys.length,
        translated,
        fromFile,
        fromDatabase,
        missing: keys.length - translated,
        percent: keys.length === 0 ? 100 : Math.round((translated / keys.length) * 1000) / 10,
      };
    });
}
