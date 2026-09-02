# Admin dashboard, Phase 0 plan and decisions

Recon record for the work specified in `DASHBOARD-BRIEF.md`. Decisions here are
settled; later phases implement them without re-opening them.

## Environment as found

- Next.js **16.2.12** installed (brief says 16.2.9; same minor), Node 25, Turbopack,
  `cacheComponents` **off**. Version specific APIs were read from
  `node_modules/next/dist/docs/` for this exact version.
- Middleware is already `src/proxy.ts`, the Next 16 convention. There is no
  `middleware.ts`; the brief's middleware work lands in `src/proxy.ts`. Proxy runs on
  the Node runtime by default and the docs say it must stay an optimistic check, so
  it does cookie presence, redirects and the IP blocklist; real session and RBAC
  checks run in pages, actions and route handlers.
- The e2e suite is **46 tests**, not the 28 documented in `HANDOFF.md` (responsive,
  RTL, contrast, mega-panel and drawer tests were added later). 46/46 with no test
  edited is the invariant.
- `npm run lint` was broken as received: `eslint-config-next@12.0.4` (2021) locked
  against `eslint@10` with a flat config importing it. Fixed in Phase 1 by moving to
  `eslint-config-next@16.2.12` on the eslint 9.x line Next 16 ships with, with the
  newly stricter rules scoped to `warn` for the five pre-existing public files that
  must not be refactored.
- The existing captcha is **reCAPTCHA v3**, not Turnstile. The security manager's
  captcha toggle governs what exists; Turnstile needs a Cloudflare account and is an
  owner decision (brief §12).
- Vercel is on the **Hobby** plan (HANDOFF Appendix B), where cron runs once a day.
  Scheduled publishing is therefore evaluated lazily in the repo layer (a scheduled
  post whose time has passed is served as published, with a short cache TTL) and the
  daily cron formalises the status flip and revalidates. Minute level cron needs a
  plan upgrade.
- `/jobs` has no listings section today, only perks and a mailto. The DB driven
  listing is added while keeping the existing design.
- The working copy was not a git repository. A local repo was initialised (never
  pushed) purely to produce a reviewable patch.
- A `next dev` server is usually live on :3000. Verification builds use
  `NEXT_DIST_DIR=.next-build` (HANDOFF §10). Running `next build` against `.next`
  while dev runs tears the dev server's generated types.

## Auth decision: hand-rolled sessions (Auth.js v5 rejected with evidence)

Auth.js v5 itself supports Next 16: `next-auth@5.0.0-beta.32` declares
`peerDependencies.next: "^14.0.0-0 || ^15.0.0 || ^16.0.0"`. The decided
**combination** does not work on any Next version. `@auth/core@0.41.3` (the exact
dependency of that beta), `lib/utils/assert.js`:

```js
if (dbStrategy && onlyCredentials) {
    return new UnsupportedStrategy("Signing in with credentials only supported if JWT strategy is enabled");
}
```

The console is invite-only email + password with no OAuth, so the provider set is
credentials-only and "Credentials + Drizzle adapter + database sessions" throws at
boot. The JWT alternative cannot satisfy the brief: per-session list and immediate
revocation (§3.1), 8h idle + 30d absolute timeouts with rotation (§7.2) and force
logout (§3.7) all need server-held sessions, and the mandatory TOTP step needs a
custom two-phase flow Auth.js does not provide.

**Stack in use** (the brief's own sanctioned fallback):

- `argon2id` password hashing (bcrypt cost 12 only if argon2 will not build).
- Opaque 256-bit session token, SHA-256 stored, `__Host-dm_session` cookie:
  httpOnly, Secure, SameSite=Lax, Path=/; 8h idle (sliding) and 30d absolute
  enforced server side; rotated on privilege change (MFA success, password change).
- `jose` HS256 tokens for invites (72h), password resets (60m) and email change
  confirmations, each bound to a single-use database row checked timing-safely.
- `otplib` TOTP, secrets encrypted at rest (AES-256-GCM, key derived from
  `AUTH_SECRET`), mandatory for Owner and Admin, single-use recovery codes.
- Rate limiting through `@upstash/ratelimit` when `UPSTASH_REDIS_REST_*` is set,
  otherwise a database-backed fixed window (durable across instances, used in dev
  and e2e).
- CSRF: Next's built-in Origin/Host check on Server Actions (verified in
  `guides/data-security.md`), plus an explicit origin check and a double-submit
  token (`__Host-dm_csrf` cookie issued by the proxy) on every route handler.

## Caching primitive

`unstable_cache(fn, keys, { tags, revalidate })` + `revalidateTag()` (the documented
"previous model", since `cacheComponents` is off and enabling it would change
rendering site-wide). Public pages are already dynamic (cookie based locale), so the
tagged data cache gives publish-without-deploy semantics.

## Layout integration

Single root layout kept (html, body, fonts, no-flash theme script). Public chrome
(MegaNav, SiteFooter, StickyCta, Organization JSON-LD, skip link) moved into
`src/app/(site)/layout.tsx` with the public page directories moved into `(site)/`
as pure mechanical moves with zero URL change. Root `not-found.tsx` renders the
same chrome itself because it handles globally unmatched URLs outside the group.
`src/app/(admin)/layout.tsx` renders its own shell (`dir="ltr"`, since the locale
cookie would otherwise flip the console to RTL) and imports `admin.css` with
`.adm-` classes and `data-admin-theme`.

## Schema (Drizzle, `src/db/schema/*.ts`)

Auth: `users`, `sessions`, `invites`, `auth_tokens`, `recovery_codes`.
Content: `posts`, `post_revisions`, `post_translations`, `media`, `content_entries`
(services, industries, products, about, site as zod-validated jsonb keyed by
entity + key), `translations`. Jobs: `jobs`, `applications`, `application_notes`,
`application_events`. Submissions: `submissions`, `submission_notes`.
SEO: `seo_overrides`, `redirects`, `seo_audits`, `seo_audit_findings`.
Security and performance: `security_events`, `ip_rules`, `rate_limit_config`,
`dependency_audits`, `web_vitals`, `psi_snapshots`, `build_stats`.
Ops: `settings` (kv jsonb, also holds the navigation document), `email_templates`,
`audit_log` (append only).

## Route map

Admin pages under `src/app/(admin)/admin/…` exactly as listed in brief §3.1 to
§3.11. Mutations are route handlers under `/api/admin/*` (JSON, session + CSRF +
RBAC checked in a shared wrapper) so every mutating endpoint can be exercised by
hand in tests. Public additions: `/jobs/[slug]`, `/api/jobs/apply`, `/api/vitals`,
`/api/cron/publish`; `/api/contact` rewritten DB-first in Phase 6.

## Repository layer

`src/lib/repo/*.ts`: each function reads the database through `unstable_cache`
with entity tags, times out at 3.5s, trips a per-instance circuit breaker after
three failures, and returns the typed `src/lib/*.ts` data on any error. It never
throws. The `src/lib` files remain the seed and the permanent fallback.
