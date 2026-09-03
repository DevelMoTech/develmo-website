# Phase 7 notes: the SEO manager

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/seo.test.ts` and `e2e/admin-seo.spec.ts`
unless marked otherwise.

## What changed on the public site

Nothing visible. Every change below serves byte identical output until an
override, redirect, robots body or Organization fact is saved in the console,
and everything falls back to the hardcoded values with the database down.

- **Metadata** (`src/lib/meta.ts`): `pageMeta()` is now async and layers a
  per-route override from `seo_overrides` on top of the hardcoded values,
  through the repo cache (`src/lib/seo/overrides.ts`, tag `seo` and
  `seo:<path>`). Pages that had a plain `metadata` object (`/our-blogs`,
  `/our-knowledge-base`, `/jobs`, `/terms`, `/cookies`, `/case-studies`,
  `/our-products/crowdiq`, the home page and the post, article and job
  detail pages) go through `withSeoOverride(path, base)` the same way. A
  route with no override row returns its base object untouched. Every
  public page was already dynamic (the locale cookie), so an override is
  live on the next request; the e2e measured 100 to 400 ms from save to
  the new `<meta name="description">`.
- **Sitemap** (`src/app/sitemap.xml/route.ts`, `src/lib/seo/sitemap.ts`):
  built from the route registry (`src/lib/seo/routes.ts`, the 15 static
  routes plus services, industries, products, posts, articles and open
  jobs) with the per-route include, changefreq and priority overrides
  applied, rendered as the exact XML the old `sitemap.ts` convention
  produced (unit tested against the format). The defaults reproduce the
  old file exactly (`/case-studies` stays out, as it was). `/admin` and
  `/api` are filtered out in code after the overrides are applied, and the
  override API refuses those paths too. The route is dynamic: every input
  is a data-cache hit on a normal request, and a file composed while the
  overrides could not be read goes out with `no-store` instead of being
  cached for five minutes. "Last generated" (`sitemap_state`) is recorded
  at most once a minute per instance and always on Regenerate now.
- **robots.txt** (`src/app/robots.txt/route.ts`, replacing `robots.ts`): the
  editable body comes from `settings.robots`; `renderRobots()` in
  `src/lib/seo/robots.ts` is the hard rule. It adds `Disallow: /admin` and
  `Disallow: /api/admin` to every User-agent group, drops any `Allow` for
  those paths, adds a `User-agent: *` group when the body has none, and
  appends the Host and Sitemap lines. The default body renders the previous
  file byte for byte (unit tested against the literal).
- **Organization JSON-LD** (`src/components/SiteChrome.tsx`): built from
  `settings.org_schema` through the repo cache (tag `schema`) with the
  facts from `src/lib/site.ts` as the fallback; `sameAs` and `url` always
  come from `site.ts`. A saved document that fails validation is never
  emitted; the default takes its place.
- **FAQPage**: the service, industry and product detail pages emit it as
  before unless the route's `faq_enabled` override is false. The visible
  FAQ section is unaffected.

## Redirects and the proxy

`src/proxy.ts` (the Next 16 name for middleware; not renamed) serves the
database redirects for public GET and HEAD requests, before the console and
API logic. The console (`/admin`) and the API (`/api`) are never redirected.

**No database round trip per request.** The proxy keeps the map in module
memory. It fetches `/api/seo/redirects` once when an instance serves its
first request (the only blocking fetch), then at most once per
**`REDIRECT_TTL_MS` = 10 seconds**, in the background through
`event.waitUntil` after the response has been sent. That route builds the
map through the repo cache (60 seconds, busted by tag on every save), so
even the refresh usually costs no query. Hits are counted in the proxy's
memory and flushed as one batch inside the refresh call (a POST with the
cron secret; without `CRON_SECRET` the map is still served and hits stay in
memory). Consequences: a saved rule is live on every instance within 10
seconds (the e2e saw 2 to 7 seconds); hits appear after the next refresh,
which the next public request after the TTL triggers; hits held by an
instance that dies before its next refresh are lost.

**How it was measured:** the e2e creates a rule, waits for the 301, then
reads `xact_commit + xact_rollback` from `pg_stat_database` for the local
database, fires 200 redirected requests, waits 1.5 seconds for the
statistics flush and reads again. A lookup per request would add at least
200 transactions; the measured delta was 1 to 4 (the test's own two reads,
the batched hit flush, and statistics lag). The line is printed as
`DB MEASUREMENT: ...` in the test output.

**Static redirects** in `next.config.ts` are untouched. They run before the
proxy, so `src/lib/seo/static-redirects.ts` mirrors them for conflict
detection and a unit test asserts the two lists are identical.

**Checks on save** (`src/lib/seo/redirect-rules.ts`): loops through database
and static rules, chains longer than 10 hops, a source already handled by
`next.config.ts`, a duplicate source, source equal to destination, and
sources under `/admin` or `/api` are errors. Chains, rules that hide a live
page, unknown destinations and existing rules that will now chain through
the new one are warnings. The console runs the check as the rule is typed.

Phase 4 already inserted redirect rows when a post slug changed; those rows
are now served.

## The console

- `/admin/seo`: live counts and the way into each tool, plus the read only
  note that cookie based locale means only English is indexed.
- `/admin/seo/pages`: all public routes (57 plus the dynamic ones), search
  and type filter, an editor with title and description counters (60 and
  155), a SERP preview, "Load current values" (fetches the live page and
  scans its head), canonical, Open Graph image from the media library,
  noindex and nofollow, sitemap fields, and the FAQPage toggle for detail
  pages. Overrides are English only; there is no locale dimension.
- `/admin/seo/redirects`: create, edit, enable, disable and delete with the
  live check, hits and last hit, and the static list shown read only.
- `/admin/seo/sitemap`: last generated time and URL count, "Regenerate now"
  (busts the cache and fetches the file so it is rebuilt immediately), and
  per route include, changefreq and priority.
- `/admin/seo/robots`: the body with live validation and a preview of what
  will be served with the hard rule applied; reset to default.
- `/admin/seo/schema`: the Organization facts with the emitted JSON-LD and
  its validation as you type; FAQPage per detail page.
- `/admin/seo/audit`: run, list with per kind deltas against the previous
  run, and a detail page with kind filters and "new since previous".

## The audit crawler

`src/lib/seo/audit.ts` runs inside `after()` on `POST /api/admin/seo/audit/run`
(`maxDuration` 300) against the request's own origin, so in production it
crawls `https://develmo.com`. Breadth first from `/` over internal links
(up to 400 pages, 4 at a time, 12 second timeout each), then every registry
route the crawl did not reach. The scanner (`src/lib/seo/html.ts`) is a
tolerant tag tokenizer, since no HTML parser is on the approved list.

Finding kinds: missing or duplicate title, missing or over length (over 160)
description, image without an alt attribute (`alt=""` is fine), broken
internal link (status 400 or higher, reported on the linking page), orphan
page (a registry route no crawled page links to), missing canonical,
canonical pointing at another page, H1 count other than one, and page did
not load. Runs and findings are stored; the detail page compares with the
previous finished run by (kind, path, target or title).

## Public site issues the audit found (not fixed here, by instruction)

- Seven pages inherit the root layout's canonical of `https://develmo.com`
  instead of their own address: `/our-blogs`, `/our-knowledge-base`,
  `/jobs`, `/terms`, `/cookies`, `/case-studies`, `/our-products/crowdiq`
  (and the post, article and job detail pages set their own). Each tells
  search engines it is a duplicate of the home page. The fix is a
  `canonical` on each page's metadata or a canonical override per route
  from the console, which now exists.
- Six descriptions are over the practical limit: `/` (192), `/who-we-are`
  (351), `/who-we-are/about-develmo` (397), `/our-products/omni-road` (277),
  `/our-products/padeliq` (188), `/our-products/crowdiq` (185).
- `/case-studies` is an orphan: no public page links to it.

## Changes driven by the adversarial review

- **JSON-LD is escaped** (`src/lib/jsonld.ts`): `<`, `>`, `&` and the two
  Unicode line separators become JSON unicode escapes before the string is
  written into `<script type="application/ld+json">`. Editable facts and
  FAQ text can no longer close the script element. Crawlers read the same
  JSON value; the bytes only differ when a value contains one of those
  characters.
- **Console fetches stay on this site** (`src/lib/seo/origin.ts`): the base
  URL from the request's forwarded headers is used only when it names
  develmo.com, this deployment's own Vercel URL (`VERCEL_URL`,
  `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) or a local server;
  otherwise `site.url` is used. That covers "Load current values", sitemap
  regeneration and the audit crawl.
- **Reserved paths**: `/robots.txt`, `/sitemap.xml`, `/admin` and `/api` can
  never be redirected; the manager refuses such sources and the proxy skips
  them even if a row existed.
- **Regenerate now** busts the cache in the request and fetches the sitemap
  in `after()`: a fetch inside the handler would still see the old file,
  because cache invalidations issued by a handler apply when it finishes.
- **A database outage keeps the last map**: `/api/seo/redirects` answers 503
  when it cannot read the rules and the proxy keeps serving what it has; a
  cold instance that failed its first fetch retries within two seconds.
- **Slug-change redirects** written by the posts editor now bust the map's
  cache tag, so the old post URL redirects within the TTL.
- **Overrides on pages that inherit the layout's Open Graph block** get a
  complete block built from the effective title and description, and an
  editor-level noindex on a post or job is never lifted by an override.
- **Job detail pages** apply overrides like every other route.
- **robots hard rule** also drops wildcard and percent-encoded Allows that
  could out-rank the protected Disallows (`/*admin`, `/admin*`,
  `/%61dmin`), while a plain `Allow: /` is kept because the longer Disallow
  wins for every crawler.
- **Audit**: a four minute crawl deadline (the run always records a result
  inside `maxDuration`), redirected pages are reported as their own finding,
  a canonical on another host is a mismatch, a run older than ten minutes is
  marked failed on the next read so the console never locks.
- **Media**: deleting an image used as an override's Open Graph image busts
  that route's cached metadata; the override falls back to the default
  artwork.
- The FAQ toggle back to "on" removes the override row when nothing else is
  on it; saving an all-default form for a route without a row is a no-op.
- **robots.txt is a dynamic route** whose body is a tag-only data cache
  entry: the saved body costs no query per request, and when the database
  cannot be read the pre-editor file goes out with `no-store` instead of
  being cached for five minutes. The Organization facts are read the same
  strict way, so a database error never caches the default document.

## Streaming metadata, and why next.config.ts gained one option

Pages that used to export a static `metadata` object now export
`generateMetadata`, which awaits the override lookup. Next 16 streams
metadata for pages with an async `generateMetadata`: when the lookup is not
settled by the time the shell is sent, browsers would receive the `<title>`
and `<meta>` tags a moment later inside `<body>` instead of in `<head>`. The
review reproduced that on the first request per route after a cold start
and after a save (bots on Next's `htmlLimitedBots` list always got a
blocking head). To keep every response byte identical to the static
objects, `next.config.ts` now sets `htmlLimitedBots: /.*/`, which makes
Next resolve metadata before sending the shell for every user agent. The
cost is the override lookup itself, a memory hit after the first request
per route (the cache is tag only, no timer). The static redirects in that
file are untouched.

Two more review items: a partial unique index (`seo_audits_one_running_idx`)
makes the database refuse a second running crawl, so two people clicking
"Run audit now" together get one run; and the e2e's database round trip
measurement asserts its strict bound only when Playwright runs one worker,
because `pg_stat_database` counts every connection and other specs would
share the counter (the figure is always printed).

## Not done, on purpose

- No URL prefixed locales; the note in the console says why.
- Redirect hits are approximate by design (batched, per instance).
- The audit crawls the deployment it runs on; it does not crawl external
  links.
