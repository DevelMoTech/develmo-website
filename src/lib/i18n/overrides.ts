// Runtime translation overrides (brief §3.9). Entries saved in the console
// live in the database and take precedence over the files; the files stay as
// the seed and the fallback, and are never written to.
//
// No imports, so this bundles into both the server and the client. The map is
// global rather than per request: a translation is the same for every visitor,
// so one module-level copy per instance is correct and costs nothing to read.
//
// With no overrides loaded, `overrideFor` returns undefined for everything and
// t() behaves exactly as it did before this layer existed. That property is
// what makes the change safe, and it is unit tested.

export type OverrideMap = Record<string, Record<string, string>>;

let overrides: OverrideMap = {};

export function setTranslationOverrides(next: OverrideMap | null | undefined): void {
  overrides = next && typeof next === "object" ? next : {};
}

export function overrideFor(locale: string, key: string): string | undefined {
  // English is the source language: it is never overridden, so a stray row
  // for "en" cannot rewrite the site's own copy.
  if (locale === "en") return undefined;
  return overrides[locale]?.[key];
}

export function currentOverrides(): OverrideMap {
  return overrides;
}

export function overrideCount(): number {
  return Object.values(overrides).reduce((n, byKey) => n + Object.keys(byKey).length, 0);
}
