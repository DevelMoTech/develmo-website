import { getDb } from "@/db";
import { translations } from "@/db/schema";
import { repoQuery } from "./util";
import { locales } from "@/lib/i18n";
import type { OverrideMap } from "@/lib/i18n/overrides";

export const TRANSLATIONS_TAG = "translations";

// Every saved override, keyed by locale then by the English source string.
// Through the repo cache with tag-only invalidation, so a page render costs
// no query and a save takes effect on the next request. With the database
// unreachable the map is empty, which means the files apply, which is the
// behaviour the site had before this layer existed.
export async function getTranslationOverrides(): Promise<OverrideMap> {
  return repoQuery<OverrideMap>({
    keys: ["repo", "translations", "overrides"],
    tags: [TRANSLATIONS_TAG],
    revalidate: false,
    query: async () => {
      const rows = await getDb().select({ locale: translations.locale, key: translations.key, value: translations.value }).from(translations);
      const out: OverrideMap = {};
      for (const r of rows) {
        // English is the source language and is never overridden.
        if (r.locale === "en" || !(locales as readonly string[]).includes(r.locale)) continue;
        (out[r.locale] ??= {})[r.key] = r.value;
      }
      return out;
    },
    fallback: () => ({}),
  });
}
