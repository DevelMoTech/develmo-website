import { desc, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { translations } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { SessionWithUser } from "@/lib/auth/session";
import { allKeys, coverage, EDITABLE_LOCALES, fileValue, isDecorative, type Coverage } from "@/lib/i18n/keys";
import { findLeaks, readLangDir, visibleText, type LeakResult } from "@/lib/i18n/leak";
import { TRANSLATIONS_TAG } from "@/lib/repo/translations";
import { trustedOrigin } from "@/lib/seo/origin";
import type { LeakRunInput, TranslationSaveInput } from "@/lib/schemas/content";

// The translations manager (brief §3.9). Overrides are written to the
// database and never to extra.ts or data.ts; the files stay the seed and the
// fallback. English is the source language and is never stored.

export type Actor = { user: SessionWithUser["user"]; ipHash: string | null };

export { EDITABLE_LOCALES };

export type CellValue = { value: string; source: "database" | "file" | "missing" };
export type GridRow = { key: string; source: "ui" | "extra"; cells: Record<string, CellValue> };

export type GridParams = { q: string; locale: string; view: "all" | "missing" | "overridden"; page: number; pageSize: number };

export function parseGridParams(sp: Record<string, string | string[] | undefined>): GridParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const locale = first(sp.locale);
  const view = first(sp.view);
  const page = Number(first(sp.page));
  return {
    q: first(sp.q).trim().slice(0, 200),
    locale: (EDITABLE_LOCALES as readonly string[]).includes(locale) ? locale : "",
    view: view === "missing" || view === "overridden" ? view : "all",
    page: Number.isFinite(page) && page >= 1 ? Math.min(Math.floor(page), 10_000) : 1,
    pageSize: 50,
  };
}

async function overrideMap(): Promise<Record<string, Record<string, string>>> {
  const rows = await getDb().select({ locale: translations.locale, key: translations.key, value: translations.value }).from(translations);
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) (out[r.locale] ??= {})[r.key] = r.value;
  return out;
}

export async function grid(params: GridParams): Promise<{ rows: GridRow[]; total: number; coverage: Coverage[] }> {
  const overrides = await overrideMap();
  const term = params.q.toLowerCase();
  const localesToShow = params.locale ? [params.locale] : (EDITABLE_LOCALES as readonly string[]);

  const all = allKeys()
    .map(({ key, source }) => {
      const cells: Record<string, CellValue> = {};
      for (const locale of EDITABLE_LOCALES) {
        const override = overrides[locale]?.[key];
        if (typeof override === "string" && override.trim() !== "") cells[locale] = { value: override, source: "database" };
        else {
          const file = fileValue(locale, key);
          cells[locale] = typeof file === "string" ? { value: file, source: "file" } : { value: "", source: "missing" };
        }
      }
      return { key, source, cells };
    })
    .filter((row) => {
      if (term && !row.key.toLowerCase().includes(term) && !localesToShow.some((l) => row.cells[l]?.value.toLowerCase().includes(term))) return false;
      if (params.view === "missing") return localesToShow.some((l) => row.cells[l]?.source === "missing");
      if (params.view === "overridden") return localesToShow.some((l) => row.cells[l]?.source === "database");
      return true;
    });

  const start = (params.page - 1) * params.pageSize;
  return { rows: all.slice(start, start + params.pageSize), total: all.length, coverage: coverage(overrides) };
}

export async function coverageOnly(): Promise<Coverage[]> {
  return coverage(await overrideMap());
}

export type SaveTranslationResult = { ok: true; cleared: boolean } | { ok: false; error: string };

// An empty value clears the override, which lets the file value apply again
// rather than storing a blank that would render as an empty string.
export async function saveTranslation(input: TranslationSaveInput, actor: Actor): Promise<SaveTranslationResult> {
  if (isDecorative(input.key)) return { ok: false, error: "decorative" };
  const db = getDb();
  const before = (await db.select().from(translations).where(sql`${translations.locale} = ${input.locale} and ${translations.key} = ${input.key}`).limit(1))[0] ?? null;
  const value = input.value.trim();

  if (value === "") {
    if (before) await db.delete(translations).where(eq(translations.id, before.id));
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "translation.clear", entityType: "translation", entityId: `${input.locale}:${input.key}`, before: before ? { value: before.value } : null, ipHash: actor.ipHash });
    bustTranslations();
    return { ok: true, cleared: true };
  }

  await db
    .insert(translations)
    .values({ locale: input.locale, key: input.key, value, updatedById: actor.user.id })
    .onConflictDoUpdate({ target: [translations.locale, translations.key], set: { value, updatedById: actor.user.id, updatedAt: sql`now()` } });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "translation.save", entityType: "translation", entityId: `${input.locale}:${input.key}`, before: before ? { value: before.value } : { value: fileValue(input.locale, input.key) ?? null, source: "file" }, after: { value }, ipHash: actor.ipHash });
  bustTranslations();
  return { ok: true, cleared: false };
}

function bustTranslations(): void {
  revalidateTag(TRANSLATIONS_TAG, { expire: 0 });
}

export type RecentTranslation = { locale: string; key: string; value: string; updatedAt: string };

export async function recentTranslations(limit = 20): Promise<RecentTranslation[]> {
  const rows = await getDb().select().from(translations).orderBy(desc(translations.updatedAt)).limit(limit);
  return rows.map((r) => ({ locale: r.locale, key: r.key, value: r.value, updatedAt: r.updatedAt.toISOString() }));
}

// ---------- Leak check ----------

// The routes the brief names, plus the ones most likely to regress.
export const LEAK_ROUTES = ["/", "/what-we-do", "/who-we-help", "/our-products", "/our-blogs", "/contact-develmo", "/jobs"];

export async function runLeakCheck(baseUrl: string, input: LeakRunInput): Promise<LeakResult[]> {
  const origin = trustedOrigin(baseUrl);
  const overrides = await overrideMap();
  // A key leaks only if this locale claims to translate it, whether the
  // translation comes from the database or the files.
  const translated = (locale: string, key: string) => overrides[locale]?.[key] || fileValue(locale, key);
  const keys = allKeys();

  const out: LeakResult[] = [];
  for (const locale of input.locales) {
    for (const route of input.routes) {
      try {
        const res = await fetch(`${origin}${route}`, {
          headers: { cookie: `locale=${locale}`, "user-agent": "DevelMo-Leak-Check/1.0", accept: "text/html" },
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        });
        const html = await res.text();
        const { lang, dir } = readLangDir(html);
        out.push({
          route,
          locale,
          status: res.status,
          lang,
          dir,
          leaks: res.ok ? findLeaks(html, locale, { keys, translated }) : [],
          examined: res.ok ? visibleText(html).length : 0,
        });
      } catch (err) {
        out.push({ route, locale, status: 0, lang: null, dir: null, leaks: [{ key: "(fetch failed)", context: err instanceof Error ? err.message : String(err) }], examined: 0 });
      }
    }
  }
  return out;
}
