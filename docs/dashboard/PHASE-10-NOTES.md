# Phase 10: site content, navigation and the translations manager

Brief section 3.9. Built on phases 1 to 9. Nothing in this phase changes a
public route's markup, headers or CSP.

## 1. Content editors, `/admin/content/`

One table, `content_entries`, holds every entity: `entity` plus `key` is
unique, `data` is jsonb, `sort_order` orders the list. The typed files in
`src/lib` stay in the repo and remain the seed and the fallback, so a database
that has never been written to serves exactly what it served before.

| Entity | Page | Rows |
| --- | --- | --- |
| pillar | `/admin/content/services` | 6 |
| service | `/admin/content/services` | 21 |
| industry | `/admin/content/industries` | 10 |
| product | `/admin/content/products` | 3 |
| about | `/admin/content/about` | 1 |
| facts, offices, stats, tech, social | `/admin/content/site` | settings rows |

**Optional shapes are preserved exactly.** `src/lib/schemas/content.ts` mirrors
the TypeScript types in zod, with `outcomes`, `faqs`, `intro` and `howItWorks`
declared `.optional()`. The editor omits an optional field entirely when it is
left empty rather than storing `[]` or `""`, because the detail pages guard on
presence and the FAQPage JSON-LD is emitted from `faqs` on 31 pages. An FAQ
entry needs both halves: `faqSchema` requires a non-empty `q` and a non-empty
`a`, so a half-filled FAQ is refused at the API rather than shipped into
structured data. The e2e proves both directions: a valid edit reaches the
public page with the FAQPage intact, and an FAQ with an empty answer is
rejected with the stored entry left untouched.

## 2. Navigation editor, `/admin/content/navigation`

`/admin/content/navigation` edits the mega menu: groups, ordering and links.
`findDeadLinks()` resolves every site path against `listPublicRoutes()`, the
same route inventory the SEO audit uses. Absolute URLs and `mailto:` are
accepted without resolution. A menu containing an unresolvable site path is
refused with `400 dead_links` and the offending entries named. The editor also
flags a dead path as it is typed, but the server check is independent of it, so
a hand-crafted POST is refused just the same.

## 3. Translations manager, `/admin/translations`

A key-by-locale grid over the same key space as `extra.ts`: the union of every
English source string that either dictionary translates for any non-English
locale, about 410 keys. Per-locale coverage percentages, a missing-keys view, a
search across keys and translations, and inline editing.

**Lookup order.** `t()` now reads:

    database override -> uiMessages[locale] -> extraMessages[locale] -> English

`src/lib/i18n/overrides.ts` is a tiny registry with no imports, so it bundles
into both the client and the server. `SiteChrome` loads the override map once
per request through `repoQuery` (tag `translations`, `revalidate: false`, so it
is tag-invalidated rather than time-expired) and sets it server-side, then
passes only the active locale's slice to a client component that installs it
during render, before any sibling client component hydrates.

**Why only one locale reaches the client.** The full map server-side avoids a
cross-locale race between concurrent requests. Sending the full map to the
client would serialise every locale's overrides into every page's RSC payload,
including the English page. The e2e caught exactly that and it is now fixed.

**The order regresses nothing.** `tests/unit/content-i18n.test.ts` iterates
every entry of both real dictionaries, over a thousand strings, and asserts
`t(key, locale)` is byte-identical with no overrides loaded. An override is
only consulted for non-English locales and only when it is a non-empty string,
so an empty value clears the override and the file value applies again rather
than rendering blank.

**The files are never written.** The console writes to the `translations`
table only. `src/lib/i18n/data.ts` is generated and is never hand-edited;
`extra.ts` stays the hand-maintained seed.

**Decorative labels.** `// FEATURED`, `// LET'S BUILD` and
`GLOBAL DELIVERY - LHR / SYD / RUH / KHI` are English by design. They are
removed from the key space, so they are not listed as missing, are never
reported as a leak, and the save endpoint refuses them outright.

## 4. Leak check runner

`/admin/translations` runs it, `src/lib/i18n/leak.ts` implements it. It fetches
each route with `Cookie: locale=<locale>` and strips, in order:

1. any element carrying `data-i18n="content"`, which is author-written body
   content that is not part of the dictionary,
2. the whole `<head>`,
3. every `<script>` block, which is where React serialises props including
   `key` into the RSC flight payload,
4. `<style>`, `<template>`, `<noscript>` and `<svg>`.

It then flags a key only when this locale actually claims to translate it,
from the database or from the files, using a whole-phrase match with Unicode
word boundaries and a six-character minimum. A naive substring scan
false-positives on the flight payload, on brand and technology names, and on
the postal address, none of which are translated.

## Leak fixes this phase required

The first run failed all 16 route and locale pairs. Every failure was a real
untranslated string on the public site, not a detector artefact:

- `ProductSlider`: the tab tags, the slide tags and the slide descriptions
- `ProductCollage`: the tile labels, which needed a `locale` prop
- `SiteFooter`: the office descriptions and "All rights reserved."
- `/who-we-are`: office names and descriptions
- `/contact-develmo`: the country line
- `/what-we-do/<slug>`: the pillar title, in two places
- `/our-blogs`: post cards marked `data-i18n="content"`, since post bodies are
  author content rather than dictionary keys

14 new keys were added to `extra.ts` across ar, ur, fr and es.

## Verification

- Build green.
- Unit: 164 passed across 14 files, 15 of them new in `content-i18n.test.ts`.
- E2E: 111 passed. `e2e/site.spec.ts` is unmodified and its 28 pass.
- Public response headers over 8 routes are byte identical to the phase 9
  capture, sha256 `61ea2fe46131f296...`. The CSP is untouched.
- Full leak check: 16 route and locale pairs, zero residual English,
  `lang="ar" dir="rtl"` and `lang="fr" dir="ltr"` correct throughout.

## Gotcha worth keeping

Props cross the server-to-client boundary as data. `EntryEditor` originally
took `publicPath: (key) => string` and every content page failed to render with
"Functions cannot be passed directly to Client Components". It now takes
`pathPrefix: string` and builds the href itself.

`npx next build` does not run npm's `postbuild` hook, so
`.next-build/build-stats.json` is absent and the phase 9 build-stats endpoint
answers 400. Build with `NEXT_DIST_DIR=.next-build npm run build`, or run
`node scripts/build-stats.mjs` afterwards.
