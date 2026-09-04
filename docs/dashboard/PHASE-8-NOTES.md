# Phase 8 notes: the security manager

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/security.test.ts` and
`e2e/admin-security.spec.ts` unless marked otherwise.

## Who can reach it

Owner and Admin only, enforced on the server. Every page and every endpoint
in the module requires the `security:write` permission, which the RBAC
matrix grants to those two roles alone. Editor and Viewer are refused with
403 from the endpoints and redirected away from the pages, which the e2e
checks by calling all eleven endpoints and visiting all seven pages with
valid sessions for both roles.

`security:read`, which Viewer holds as part of "read only everywhere",
deliberately is **not** used as the gate here. Reading the event log means
reading failed logins, IP hashes and user agents, which is not viewer
material.

## IP access control

Rules live in `ip_rules` and are enforced in `src/proxy.ts`, before any page
or route runs, so a blocked address gets a plain-text 403 on the whole site,
API included.

**No database lookup per request.** Same shape as the Phase 7 redirect map:
the proxy holds the rule set in module memory and refreshes it from
`/api/security/access-rules` at most once per **`ACCESS_TTL_MS` = 5 seconds**,
in the background after the response. The endpoint reads through the repo
cache (30 seconds, busted by tag on every save). The e2e measured a block
taking hold in 2 to 5 seconds and an unblock in about the same.

Unlike the redirect map, the rule set is **not public**: a blocklist tells an
attacker which of their addresses are known, so the endpoint requires the
cron secret and the proxy sends it. Two consequences, both deliberate:

- Without `CRON_SECRET`, or with the database unreachable, the endpoint
  refuses and the proxy keeps the last rule set it had. An unreadable
  blocklist **fails open**: a marketing site that cannot reach its database
  must still serve visitors. A cold instance in that state enforces nothing
  and retries in two seconds rather than waiting a whole TTL.
- The two endpoints the proxy feeds itself from (`/api/security/access-rules`
  and `/api/seo/redirects`) are exempt from the check, or the refresh would
  wait on itself.

Matching (`src/lib/security/cidr.ts`) is a hand-rolled IPv4 and IPv6
implementation, no dependency added. Addresses are compared as 16 byte
arrays, so an IPv4-mapped IPv6 address matches an IPv4 rule and the reverse.
Ports, brackets and zone indexes are stripped; octal-looking octets and
malformed groups are rejected rather than guessed at.

**Allow beats block**, which is the way out of an over-broad rule: block a
/24 and allow the one address inside it that should still get through. Among
blocks the most specific match is the one reported.

**The lockout guard** refuses to save a block covering the address you are
connecting from unless that exact address is typed into a confirmation
field. The check runs in `saveAccessRule` on the server, so calling the API
directly does not skip it, and nothing is written on a refusal. The e2e
proves all three: no confirmation, a /24 that happens to cover you, and a
wrong confirmation, each refused with `self_lockout` and no row created.

Expired rules stop applying immediately (the evaluation ignores them) and
the cron deletes them.

## Event log

`/admin/security/events` reads `security_events`, which the auth flows, the
API wrapper, the public forms and the upload path have been writing since
Phase 2. Filters (type, account, date range, free text over the type, path,
user agent and metadata) are URL-backed; CSV export follows the current
view. Only the salted IP hash is stored and exported, never an address.

Retention is configurable, default 180 days, purged by the cron. **The audit
log is separate and is never deleted**, for any role, which the retention
card states.

## Rate limits

The `rate_limit_config` table and the runtime lookup already existed; this
phase gives them a UI, live counters and an audit trail. Four endpoints are
editable: contact, job application, login and password reset. The limiter
reads its configuration through a 30 second cache, so a change is in force
on every instance within that window, with no restart and no deploy, which
the e2e proves by tightening the contact limit to one per minute and
watching a second request from the same address answer 429.

The limiter runs **before** validation, so in an environment with reCAPTCHA
keys the request it lets through answers 400 on the captcha rather than 200.
The e2e asserts the transition (through, then refused), not a specific route
status, because the route's own answer is not what the limit controls.

## Turnstile

`settings.turnstile` holds `{ enabled, siteKey }`. Site keys are public by
design; the secret stays in the environment as `TURNSTILE_SECRET_KEY` and is
never read back to the browser. The toggle refuses to switch on without both
a site key and that environment variable.

**Switching it on also needs one CSP change**, adding
`https://challenges.cloudflare.com` to `script-src` and `frame-src`. This
phase leaves the public policy byte identical, so that one line is a
deploy the owner has to approve. The console says so on the toggle rather
than letting someone switch it on and find the widget blocked. Until then
the public forms keep reCAPTCHA v3, unchanged.

## Response headers

`/admin/security/headers` is **read only**. It fetches a live URL on this
deployment, reads the headers back and grades them against the
securityheaders.com rules. It never sets, changes or proposes a header: the
policy is deployed with the code in `next.config.ts`.

The live grade is **A**: five of the six graded headers pass, and the CSP is
a warning because it allows `'unsafe-inline'` and `'unsafe-eval'`, which
Next's runtime and the JSON-LD blocks need. A nonce based policy is the
roadmap item in HANDOFF §9.2.1 and is out of scope here. Nothing in this
phase needed a CSP allowance, so no path-scoped `/admin` header was added
either.

## Sessions and accounts

`/admin/security/sessions` lists every active session across every account
with its client, IP hash and expiry, and revokes any one of them; the holder
is signed out on their next request because every request revalidates the
session row. The account controls are force sign out, force password reset,
force two-factor re-enrolment, lock and unlock. Each revokes the target's
sessions as part of the action.

Two refusals are enforced on the server and mirrored in the UI so they are
never a surprise: an Admin cannot act on an Owner, and nobody can lock their
own account.

## Dependencies

`npm audit` needs the npm CLI and a writable project directory, neither of
which a serverless function has. `src/lib/security/deps.ts` asks the same
question the same way npm does: it reads the installed tree from
`package-lock.json` and posts the name and version list to the registry's
bulk advisory endpoint. That is the call `npm audit` makes underneath, and
it runs anywhere the site runs. `next.config.ts` adds
`outputFileTracingIncludes` so the lockfile travels with the cron route and
the on-demand scan route.

Runs are stored with their severity counts and advisory links, so a new
advisory shows up as a change rather than a number. A failed scan is stored
with its reason rather than silently skipped.

**The first real scan, from the cron, found six advisories across 648
installed packages:**

| Severity | Package | Ships to production | Advisory |
| --- | --- | --- | --- |
| high | postcss 8.4.31, 8.5.26 | yes | Arbitrary file read via sourceMappingURL (GHSA-6g55-p6wh-862q) |
| high | postcss 8.4.31, 8.5.26 | yes | Path traversal in source map auto-loading (GHSA-r28c-9q8g-f849) |
| high | sharp 0.34.5 | yes | Inherited libvips vulnerabilities (GHSA-f88m-g3jw-g9cj) |
| moderate | postcss 8.4.31, 8.5.26 | yes | Incomplete fix of GHSA-6g55-p6wh-862q (GHSA-fxqj-rqcc-2cmp) |
| moderate | postcss 8.4.31, 8.5.26 | yes | XSS via unescaped `</style>` in stringify output (GHSA-qx2v-qp2m-jg93) |
| moderate | esbuild 0.18.20, 0.25.12, 0.28.2 | build and test only | Dev server request exposure (GHSA-67mh-4wv8-2f99) |

All of these are transitive dependencies of Next and Tailwind, not direct
ones. They are reported, not fixed: upgrading them is a dependency change
the owner should decide on, and the postcss ones apply to build-time CSS
processing rather than request handling.

## Public output

The public response headers are byte identical to the Phase 7 baseline,
verified by capturing every header on eight public URLs from a cold server
before and after and diffing them. The only line that moves is the
Next-generated `link` preload hint, which names the CSS bundle by content
hash; the public bundle contains no admin rules, and the utilities that
differ between builds are unused Tailwind classes, not anything the site
renders with.

## Two existing tests corrected

`e2e/admin-posts.spec.ts` asserted that after a slug change the old URL
returns 404, and that after restoring the slug the original URL returns 200
immediately. Both encoded the behaviour from before Phase 7, when slug-change
redirect rows were written but never served. Now that the proxy serves them
from a map with a refresh window, the old URL correctly returns a 301 and
the restored URL takes a moment to come back. Both assertions now wait for
the window and assert the correct outcome. Nothing was weakened: the first
now checks the 301 and its Location, which the old assertion never did.
