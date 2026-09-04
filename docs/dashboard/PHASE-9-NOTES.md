# Phase 9 notes: the performance manager

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/performance.test.ts` and
`e2e/admin-performance.spec.ts` unless marked otherwise.

## Core Web Vitals, and the CSP question

The brief asked me to stop and report if first-party vitals needed a CSP
change. **They do not, and none was made.** The public policy is byte
identical to the Phase 7 baseline.

The reason is in the policy the site already had:

```
connect-src 'self' https://www.google.com https://api.resend.com https://*.sanity.io
```

`navigator.sendBeacon()` is governed by `connect-src`, and the reporter posts
to `/api/vitals` on the same origin, which `'self'` already allows. No third
party script is loaded and no third party origin is contacted. The e2e proves
it rather than asserting it: it reads the live CSP header, then visits three
public pages with a console listener watching for any CSP violation, and
checks that rows arrive for all three routes.

`src/components/WebVitals.tsx` mounts in the public site chrome only, never
in the console. It uses Next's `useReportWebVitals` and reports LCP, INP,
CLS, FCP and TTFB. Three details worth knowing:

- **Sampling is per page view, not per metric.** One coin toss decides
  whether a visit reports at all, so a sampled visit sends all of its
  metrics. Sampling per metric would skew the p75.
- **Batching.** Samples accumulate and go out in one beacon, either 2.5
  seconds after the first (so LCP, FCP and TTFB are not lost if the unload
  beacon is dropped) or when the page is hidden (which is when CLS and INP
  have settled). `pagehide` and `visibilitychange` both flush.
- **The rate is configurable.** `NEXT_PUBLIC_VITALS_SAMPLE_RATE` overrides
  the 0.25 default. Local development and the e2e set it to 1 so the console
  has data to show; production should leave it at the default.

`/api/vitals` answers 204 with an empty body, always. A reporting endpoint
should never tell a caller anything, never cost the visitor a parse, and
never fail a page. Bad input is dropped silently, the insert happens after
the response, and a durable rate limit caps how much any one address can
write.

Routes are collapsed onto the pattern that produced them, so
`/our-blogs/some-post` is counted under `/our-blogs/[slug]`, and anything
that is not a known public shape is bucketed as `other`. That stops
arbitrary URLs growing the table without bound.

The console shows p75 per route per metric per device class, over 7 or 28
days, with Google's published thresholds colouring each cell. Postgres
computes the percentile, so the table is never read into the app.

## PageSpeed Insights

`/admin/performance/psi` runs PSI on demand per route and stores the result
as a snapshot. The scores, the category names, the opportunity titles, the
wording and the stated savings are **PSI's own**, passed through unchanged.
Nothing is re-weighted and no grade of ours is invented. The opportunity
list is built from the ids PSI itself puts in the performance category's
`auditRefs`, filtered only to drop audits PSI marked as passed or not
applicable. Runs need `PSI_API_KEY`; without it the page says so instead of
offering a button that cannot work.

## Asset report

`/admin/performance/assets` walks `public/` for real byte sizes, adds the
uploaded media library, and measures what the server actually sends for the
twenty largest by issuing a ranged request and reading `content-range`. The
three hero clips are called out with their real sizes and what they cost a
mobile visitor:

| File | Bytes | Size |
| --- | --- | --- |
| /hero-1.mp4 | 1,001,771 | 0.96 MB |
| /hero-2.mp4 | 561,996 | 0.54 MB |
| /hero-3.mp4 | 1,052,957 | 1.00 MB |
| **All three** | **2,616,724** | **2.50 MB** |

At 5p per MB out of bundle that is about 12p, or £1.25 roaming at 50p per
MB, and 13.1 seconds on the 1.6 Mbps link Lighthouse throttles to. The
tariffs are stated as an assumption next to the number, not presented as a
measurement.

"Referenced by" comes from the build: the repo is present then and not at
runtime, so `scripts/build-stats.mjs` scans the source for each public path
and records the map.

## Build and bundle stats

Turbopack prints no "First Load JS" column and writes no
`app-build-manifest.json`, so there was no ready-made number to read. It
does write one RSC client-reference manifest per route listing that route's
client chunks. `scripts/build-stats.mjs` parses those, sums the real file
sizes, adds the root client runtime every route pays for, and writes
`<dist>/build-stats.json`. It runs as npm's `postbuild`, so it fires after
every `next build` including on Vercel.

Today's numbers: 172 routes, 446 kB shared runtime, 2.32 MB of client JS in
total. The console records a snapshot on demand and shows the delta against
the previous one.

**One caveat stated in the UI:** these are uncompressed bytes, and a chunk
shared by several routes is counted in each of them even though a visitor
downloads it once and the browser caches it. The figures are for comparing
routes against each other and tracking movement build to build, not for
comparison against a published benchmark.

Running `npx next build` directly does not fire `postbuild`; use
`npm run build`, or `npm run perf:build-stats` afterwards.

## Cache control

`/admin/performance/cache` lists every tag the repo layer uses, what each
holds, and when it was last invalidated. That timestamp is read from the
audit trail by mapping each tag to the actions known to bust it, so it
reports what actually happened rather than a number this page invented.

"Revalidate this tag" and "revalidate this path" are the manual escape
hatch; publishing from Phases 4 to 7 already busts the right tag. The path
control offers only real public routes and refuses `/admin` and `/api`.

## Media settings and HeroStage

`/admin/performance/media` holds two settings: whether the hero clips play
on touch devices, and a width at or below which the poster shows and the
video is never fetched. Both default to today's behaviour exactly, so
nothing changes until the owner changes it.

HeroStage changed as little as it could: 25 lines added, 6 changed. The
auto-advance timer and the pause-every-other-clip loop are untouched. The
only difference is that the active clip is not started when playback is
off, and `preload` becomes `none`, which is what actually saves the bytes.
The media queries are read with `useSyncExternalStore`, so the server
renders exactly the markup it always did and the client settles after
hydration.

**`prefers-reduced-motion` wins over both settings**, always. The slider
still advances through the three posters, because the brief requires the
auto-advance to keep working exactly.

The e2e proves the slider by DOM inspection: three video elements, only the
active one unpaused, the active index moving 0 to 1 to 2 with no
interaction, the dots following, and a dot click still selecting directly.

## Not done, on purpose

- Nothing was migrated to `next/image`. The logo collapses to `width: 0` in
  flex containers, which is a separate roadmap item.
- INP needs a real interaction, so it rarely appears in a short automated
  visit. It arrives from real visitors.
