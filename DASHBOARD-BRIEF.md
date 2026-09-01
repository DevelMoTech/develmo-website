# DevelMo Admin Dashboard, Build Brief for Claude Code

> Read this file in full, then `HANDOFF.md` and `AGENTS.md` in full, before writing any code.
> This brief is the scope of work. Where this brief and `HANDOFF.md` disagree, `HANDOFF.md` §5 (conventions) and §7 (gotchas) win on how the existing site works, and this brief wins on what to build.

---

## 0. Ground rules, read before anything

1. **Live production site.** `develmo.com` is live. The owner deploys, you do not. Never `git push`. You hand back a patch or a file list. A bad change reaches the real domain within 30 seconds of the owner pushing.
2. **Next.js 16.2.9 is not the Next.js in your training data.** App Router, RSC, async server components, Turbopack. For anything version specific (Server Actions, `middleware` vs `proxy`, caching primitives, `revalidateTag`, route handler signatures, `cookies()`/`headers()` async access), read `node_modules/next/dist/docs/` before you write it. Do not guess API shapes.
3. **Do not regress the public site.** Zero visual change to any of the 57 existing public routes. The existing Playwright suite must stay at 28/28 with no test edited.
4. **Design language §5.5 is binding on the dashboard too.** No purple, no blue to violet gradients, no gradient text, no glassmorphism or frosted blur, no em dashes or en dashes in any copy you write (use commas). Teal as text on light surfaces is `#0a8576`, never `#3df2e0`. Raleway for headings, Hanken Grotesk for body.
5. **Do not break i18n.** See §3.9 for the exact rule on admin strings.
6. **Ask before**: adding a dependency outside the approved list (§4), changing any public route, loosening the CSP, altering the i18n architecture, or touching DNS, Vercel or email records.
7. **No half built controls.** Every button, link, tab, filter, toggle and form in what you ship must do something real. No `onClick={() => {}}`, no `href="#"`, no "coming soon" panels, no mock or placeholder data left in the shipped code. If a feature cannot be finished, leave it out of the navigation and list it in your final report instead.

---

## 1. What you are building

An internal **admin and operations console** for DevelMo staff, mounted at `/admin`, backed by a real database and a real authentication system.

The purpose is the original project goal stated in `HANDOFF.md` §9.4: remove the developer bottleneck. Today, changing a blog post, a job listing, a page title or a meta description requires a developer, a commit and a deploy. After this work, a non technical staff member logs in and does it themselves, and the public site picks it up without a rebuild.

`HANDOFF.md` §9.3 says authentication needs a scope decision and sign off before it is built. **That sign off is given here.** The scope is use case (b) in §9.3, an internal admin and CMS console. It is explicitly **not** a CrowdIQ customer portal and **not** an end user account system. Do not build customer facing accounts, do not integrate the CrowdIQ product backend, do not add a public "register" surface anywhere on the marketing site.

### Success criteria in one sentence
A DevelMo staff member on a phone or a laptop can log in, publish a blog post, post a job, read and triage a contact enquiry, fix a page's meta description, block an abusive IP, see what is slow, and switch the dashboard theme, all without a developer and without a deploy.

---

## 2. Architecture decisions, already made

These are decided. Implement them. Do not re-open them, and do not spend a phase comparing alternatives.

| Concern | Decision | Notes |
|---|---|---|
| Database | **Postgres**, provisioned on **Neon** (serverless driver, Vercel friendly, free tier) | Supabase Postgres is an acceptable substitute if Neon is blocked. Must be Postgres. |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit** | TypeScript first, real SQL migrations checked into `drizzle/`, no codegen daemon. Schema lives in `src/db/schema/*.ts`. |
| Auth | **Auth.js v5** (`next-auth@beta`) with the **Credentials** provider, the **Drizzle adapter**, and **database sessions** | **Verify Next 16.2.9 compatibility in Phase 0 before committing to it.** If it does not work cleanly on App Router in Next 16, fall back to the hand rolled path below and say so in your report. |
| Auth fallback | Hand rolled sessions: `argon2id` password hashing, opaque session token in a `__Host-` prefixed httpOnly cookie, a `sessions` table, and `jose` only for short lived signed tokens (invites, resets) | Fewer moving parts, zero framework compatibility risk. This is a perfectly good outcome, not a failure. |
| Second factor | **TOTP** via `otplib`, QR enrolment via `qrcode`, **mandatory for Owner and Admin roles**, with single use recovery codes | |
| Account creation | **Invite only.** One time Owner bootstrap via a seed script gated on `ADMIN_BOOTSTRAP_TOKEN`. After that, an existing Owner or Admin issues an invite, the invitee receives an emailed single use token and sets their own password at `/admin/signup?token=...` | See §3.1. There is no open signup. |
| Media storage | **Vercel Blob** | Blog images, OG images, job attachments, CV uploads. Never store uploads in the repo or in `public/`. |
| Transactional email | **Resend** | Invites, password resets, submission notifications, digests. `RESEND_API_KEY` already exists as an env path in `HANDOFF.md` Appendix A. |
| Rate limiting | **Upstash Redis** via `@upstash/ratelimit` | Use it for auth endpoints **and** replace the in memory limiter in `src/app/api/contact/route.ts`, which closes `HANDOFF.md` §9.2 item 2. |
| Validation | **zod v4** | Already in the stack. One schema per entity in `src/lib/schemas/`, shared by client form, server action and API route. |
| Tables and lists | Hand rolled, with state in the URL `searchParams` (page, sort, filter, query) | No table library. URL state means every list view is linkable and back button safe. |
| Charts | Hand rolled inline SVG for sparklines, bars and trend lines | Only reach for `recharts` if a view genuinely needs interactive multi series plotting, and say why in your report. |
| Rich text | **Markdown**, edited in a textarea with live preview, rendered server side through `remark` / `rehype` with **`rehype-sanitize`** | No WYSIWYG dependency. Matches the existing English markdown style post bodies. Sanitize on render, always. |
| Admin styling | Scoped `.adm-` prefixed classes in a **new** `src/app/(admin)/admin.css`, consuming the existing design tokens from `globals.css` | Do not add admin styles to `globals.css`. Do not restyle or reuse public site component classes. |
| Public data reads | A **repository layer** at `src/lib/repo/*.ts` that reads the DB and falls back to the existing typed `src/lib/*.ts` files | See §5.1. This is the single most important safety decision in this brief. |

---

## 3. Feature modules

Each module lists routes, capabilities and acceptance criteria. The acceptance criteria are what your e2e tests must prove.

### 3.1 Authentication and accounts

**Routes:** `/admin/login`, `/admin/signup?token=`, `/admin/forgot-password`, `/admin/reset-password?token=`, `/admin/mfa/enrol`, `/admin/mfa/verify`, `/admin/account`

**Capabilities**
- Email plus password login, with a TOTP challenge for Owner and Admin.
- Signup is redemption of a single use, time limited invite token (72 hour expiry). The page renders an error state, not a form, for a missing, expired, already used or malformed token.
- One time Owner bootstrap: `npm run admin:bootstrap` creates the first Owner from `ADMIN_BOOTSTRAP_EMAIL` and prints a temporary password. It refuses to run if any user already exists, or if `ADMIN_BOOTSTRAP_TOKEN` is unset or does not match.
- Password reset by emailed single use token, 60 minute expiry, invalidating all other sessions on success.
- Session list on `/admin/account`: device, IP, user agent, last seen, with "revoke" per session and "revoke all others".
- Profile: name, email (change requires re-auth and email confirmation), avatar, password change, MFA enrol and reset, theme preference.

**Roles (RBAC)**

| Role | Can |
|---|---|
| **Owner** | Everything, including user management, role changes, security settings and destructive deletes. Cannot be demoted or deleted by anyone else. At least one must always exist. |
| **Admin** | Everything except changing Owner accounts and the settings marked owner only. |
| **Editor** | Content: posts, jobs, media, site content, translations, per page SEO. Read only on submissions. No user, security or settings access. |
| **Viewer** | Read only everywhere, including submissions. No mutations at all. |

Enforce RBAC **on the server**, in the route handler or server action, not only by hiding UI. Hide the UI as well.

**Acceptance criteria**
- Valid credentials plus valid TOTP reaches `/admin`. Invalid credentials return one generic message ("Invalid email or password") with no user enumeration and no timing difference.
- 5 failed logins from one IP within 10 minutes are rate limited with a `429` and a clear retry message.
- A Viewer receives a `403` from a mutating endpoint even when the request is crafted by hand, not just when the button is hidden.
- An unauthenticated request to any `/admin/*` route other than the auth pages redirects to `/admin/login?next=<path>`, and lands on `<path>` after login.
- Revoking a session invalidates it immediately on the next request.

### 3.2 Dashboard home

**Route:** `/admin`

At a glance, each tile linking to its module: new submissions (unread count, 7 day sparkline), posts (published, drafts, scheduled), jobs (open roles, new applications), traffic and Core Web Vitals summary, security events in the last 24 hours (failed logins, rate limit trips, blocked IPs), a site health strip (last publish, cache state, DB reachable, email provider reachable, sitemap last generated), and a recent activity feed from the audit log.

**Acceptance criteria:** every tile shows real data from the database, no placeholder numbers, and every tile is a working link.

### 3.3 Blog and knowledge base management

**Routes:** `/admin/posts`, `/admin/posts/new`, `/admin/posts/[id]`, `/admin/posts/[id]/preview`

**Capabilities**
- Full CRUD over posts, with `draft`, `scheduled`, `published`, `archived` states.
- Fields: title, slug (auto from title, editable, uniqueness checked live), excerpt, body (markdown), hero image, author, category, tags, reading time (computed), `publishedAt`, `updatedAt`, canonical override, and per post SEO (meta title, meta description, OG image, `noindex` flag).
- A slug change offers to auto create a 301 in the redirects table (§3.6), defaulted on.
- Scheduling: a post with `status=scheduled` and a future `publishedAt` goes live without a deploy. Implement with a Vercel Cron route handler at `/api/cron/publish`, protected by `CRON_SECRET`, which flips due posts and calls `revalidateTag`.
- Revisions: every save writes a revision row. Diff view between any two revisions, and one click restore.
- Preview: an authenticated preview of a draft rendered in the real public post template, at a URL that returns 404 for anonymous visitors.
- Per locale translation fields for title, excerpt and body, with a coverage indicator per locale. `HANDOFF.md` §8 notes post bodies are currently English only. This makes translating them possible, it does not require it.
- Bulk actions: publish, unpublish, archive, delete, retag.
- Knowledge base articles use the same model with a `type` discriminator (`blog` or `kb`), so `/our-blogs` and `/our-knowledge-base` are both DB driven.

**Acceptance criteria:** create a post in the dashboard, publish it, and it appears at `/our-blogs/<slug>` on the public site within one revalidation cycle, with correct `<title>`, meta description, OG tags and JSON-LD. Unpublish it and the route returns 404. The three seeded posts in `src/lib/posts.ts` still render identically after migration.

### 3.4 Job board

**Routes:** `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/[id]`, `/admin/jobs/[id]/applications`, `/admin/applications`, `/admin/applications/[id]`

**Capabilities**
- Job CRUD: title, slug, department, location, office (tied to the offices in `src/lib/site.ts`, that is UK, Australia, Saudi Arabia, Pakistan), employment type, seniority, remote policy, salary range with currency and a "hide salary" flag, summary, responsibilities, requirements, benefits, `opensAt`, `closesAt`, status (`draft`, `open`, `paused`, `closed`), and per job SEO fields.
- The public `/jobs` page and a new `/jobs/[slug]` detail page become DB driven, and each job emits **`JobPosting` JSON-LD** so roles are eligible for Google Jobs. Keep the existing `/jobs` visual design.
- A public application form on each job detail page: name, email, phone, location, LinkedIn, portfolio, cover note, CV upload (PDF or DOCX, 10 MB cap, content type sniffed from bytes, never trusted from the client), plus the same honeypot, rate limit and optional Turnstile protection as the contact form.
- Applicant pipeline: `new`, `screening`, `interview`, `offer`, `hired`, `rejected`, with stage changes, internal notes, a star rating, assignment to a staff user, and a stage change audit trail.
- CV download through a short lived signed URL, never a public blob URL.
- CSV export of applications for a job.
- Applicant emails: acknowledgement on submit, and a manual "send rejection" using an editable template.

**Acceptance criteria:** creating and opening a job makes it appear on `/jobs` and at `/jobs/<slug>` with valid `JobPosting` JSON-LD. Submitting the public application form creates a row visible in `/admin/applications` with the CV retrievable. Closing a job removes it from `/jobs` and returns 410 or 404 on the detail route, your choice, documented.

### 3.5 Form submissions inbox

**Routes:** `/admin/submissions`, `/admin/submissions/[id]`, `/admin/submissions/spam`

This is the primary conversion surface for the business, per `HANDOFF.md` §1. Treat it as the most important module after auth.

**Capabilities**
- Every submission from every form on the site lands here: contact form, job applications (cross linked to §3.4), and newsletter signups.
- Modify `src/app/api/contact/route.ts` to **write to the database first**, then run the existing delivery chain (Resend, webhook, FormSubmit). A delivery failure must never lose the enquiry, and must be recorded on the row as `deliveryStatus` with the error text.
- Captured context: name, email, phone, company, message, the `?service` / `?industry` / `?intent` qualifiers the form already reads, referrer, landing page, UTM parameters, locale, user agent, IP (see retention note), and timestamp.
- Triage: status (`new`, `read`, `in progress`, `qualified`, `won`, `lost`, `spam`), assignment to a staff user, internal threaded notes, tags, and a `mailto:` reply action prefilled from a configurable template.
- Filtering and search across status, assignee, date range, qualifier and free text, all held in the URL.
- Spam view for honeypot and Turnstile rejections, which are currently discarded silently, plus a "not spam" action that restores the row.
- "Replay delivery" button that re-runs the delivery chain for a row that failed to send.
- CSV export of the current filtered view.
- Unread badge in the sidebar, and an optional daily or instant email digest per user.
- **Retention:** a configurable retention window with a documented default of 24 months, and a hard delete action per row. Store the IP hashed with a server side salt, not in plain text, and record why it is stored (abuse prevention). Flag GDPR retention for CVs and enquiries as an owner decision in your report.

**Acceptance criteria:** a real submission through the public contact form appears in the inbox within seconds, with the correct qualifier fields, and remains recorded even when `RESEND_API_KEY`, the webhook and FormSubmit are all unreachable.

### 3.6 SEO manager

**Routes:** `/admin/seo`, `/admin/seo/pages`, `/admin/seo/redirects`, `/admin/seo/schema`, `/admin/seo/audit`

**Capabilities**
- **Per route overrides:** a table of all 57 public routes plus dynamic ones, each with editable meta title, meta description, canonical, OG image, and `noindex` / `nofollow` toggles. `src/lib/meta.ts` `pageMeta()` becomes override aware, falling back to the current hardcoded values when no override exists. Live character counters against the practical limits (about 60 for title, about 155 for description) and a SERP preview.
- **Redirects manager:** create, edit, disable and delete 301 or 302 redirects, source and destination, with loop and conflict detection and a hit counter. Served from the database in `middleware.ts` alongside the existing static `next.config.ts` redirects, which stay put.
- **Sitemap control:** per route include or exclude, `changefreq` and `priority`, plus last generated time and a "regenerate now" action.
- **robots.txt editor** with a validity check, and a hard rule that `/admin` and `/api/admin` stay disallowed regardless of what is typed.
- **Structured data:** view the Organization JSON-LD from `layout.tsx` and edit the underlying facts, toggle FAQPage output per detail page, and validate the emitted JSON-LD shape before save.
- **Audit tools:** an on demand crawl of internal routes reporting missing or duplicate titles, missing or over length descriptions, missing alt text, broken internal links, orphan pages, missing canonicals, and pages with no H1 or more than one H1. Store each run so results can be compared over time.
- Surface a read only note in the UI: cookie based locale means only English is indexed today (`HANDOFF.md` §8). Do **not** attempt the URL prefixed locale refactor in this work.

**Acceptance criteria:** setting a meta description override for `/what-we-do` changes the served `<meta name="description">` on the public route without a rebuild. A redirect added in the dashboard 301s correctly on the next request. Excluding a route removes it from `sitemap.xml`.

### 3.7 Security manager

**Routes:** `/admin/security`, `/admin/security/events`, `/admin/security/access`, `/admin/security/headers`, `/admin/security/dependencies`

**Capabilities**
- **Event log:** failed logins, successful logins, rate limit trips, honeypot and Turnstile rejections, permission denials, admin mutations, session revocations, upload rejections. Filterable, exportable, retained per the configured window.
- **Access control:** IP and CIDR blocklist and allowlist enforced in `middleware.ts`, with a reason and an optional expiry per entry. A blocked IP gets a 403 on the whole site. Guard against lockout: refuse to block the requesting IP without a typed confirmation.
- **Rate limit configuration:** per endpoint limits (contact form, job application, login, password reset) editable at runtime, with current counters shown.
- **Turnstile:** a toggle plus a site key field so `HANDOFF.md` §9.2 item 3 can be switched on without a deploy, with the secret staying in the environment.
- **Headers viewer:** a read only panel showing the live response headers with a pass or fail per header against the `securityheaders.com` grading rules. **Do not change the existing CSP.** Nonce based CSP is roadmap item §9.2.1 and is out of scope. If the dashboard genuinely needs a CSP allowance, add a **path scoped** header for `/admin` only in `next.config.ts` and leave the public policy byte identical.
- **Session and user oversight:** all active sessions across all users, force logout, force password reset, force MFA re-enrolment, lock or unlock an account.
- **Dependency status:** run `npm audit --json` on a cron and surface the summary with severity counts and advisory links, which is `HANDOFF.md` §9.2 item 4 without adding a GitHub integration.

**Acceptance criteria:** a blocked IP receives 403 on the public homepage. Three failed logins produce three visible events. Changing the contact form rate limit takes effect without a restart.

### 3.8 Performance manager

**Routes:** `/admin/performance`, `/admin/performance/assets`, `/admin/performance/cache`

**Capabilities**
- **Core Web Vitals:** collect real user metrics with a `useReportWebVitals` hook posting LCP, INP, CLS, FCP and TTFB to `/api/vitals`, sampled, batched with `sendBeacon`, stored per route. Show p75 per route per device class over 7 and 28 day windows. This is first party, it adds no third party script and needs no CSP change.
- **PageSpeed Insights:** an on demand PSI API run per route (`PSI_API_KEY`), stored as a snapshot so runs are comparable over time. Show the opportunity categories PSI returns, do not invent your own scoring.
- **Asset weight report:** enumerate `public/` and Blob media with size, type and which routes reference them. Flag the known heavy items, `hero-1/2/3.mp4` in particular, with transfer size and a mobile data cost estimate. This serves the `HANDOFF.md` §9.1 concern about hero video cost on mobile.
- **Build and bundle stats:** parse the Next build output and `.next/` route manifests to show per route first load JS and the largest client chunks, with a delta against the previous recorded build.
- **Cache control:** show current cache tags and their last revalidation, plus explicit "revalidate this path" and "revalidate this tag" buttons calling `revalidatePath` and `revalidateTag`. Every publish action elsewhere already triggers the right tag, this is the manual escape hatch.
- **Media settings:** toggle hero video autoplay on mobile, and set a poster only breakpoint, persisted in settings and read by `HeroStage`. Respect `prefers-reduced-motion` regardless of the setting.

**Acceptance criteria:** visiting three public pages produces vitals rows attributed to the correct routes. A manual revalidate visibly updates a stale public page. The asset report lists the three hero videos with real byte sizes.

### 3.9 Site content and translations

**Routes:** `/admin/content/services`, `/admin/content/industries`, `/admin/content/products`, `/admin/content/about`, `/admin/content/site`, `/admin/content/navigation`, `/admin/translations`

**Capabilities**
- Editable versions of the typed content currently in `src/lib/services.ts` (6 pillars, 21 services), `src/lib/industries.ts` (10), `src/lib/products.ts` (3), `src/lib/about.ts`, and the company facts, offices, stats, tech and social links in `src/lib/site.ts`. Preserve the existing optional shapes `outcomes[]`, `faqs[]`, `intro`, `howItWorks[]`, and keep the FAQPage JSON-LD emitting correctly.
- Navigation editor for the mega menu structure, ordering and grouping, with a guard that refuses to save a menu containing a link to a route that does not resolve.
- **Translations manager:** a key by locale grid over the same dictionary space as `src/lib/i18n/extra.ts`, with per locale coverage percentages, a missing keys view, search and inline editing. Database entries override the file at runtime, the file stays as the seed and the fallback.
- A **leak check runner** that fetches selected public routes with `Cookie: locale=ar` and `locale=fr`, strips `<head>` **and** `<script>` blocks per the RSC gotcha in `HANDOFF.md` §5.2 and §7, and reports residual English. This turns the manual §10 step 3 check into a button.

**The i18n rule for this work, exactly:**
- **Admin interface strings are English only, by decision.** Do not wrap admin UI strings in `t()`. Do not add a single admin string to `src/lib/i18n/extra.ts` or `src/lib/i18n/data.ts`. The console is an internal tool for a small English speaking staff, and adding hundreds of admin keys would make the public leak check unmaintainable.
- **Never hand edit `src/lib/i18n/data.ts`.**
- If the dashboard writes a translation, it writes it to the **database**, not to `extra.ts`.
- Any string the dashboard causes to render on the **public** site follows the normal rule: it goes through `t()` / `loc()` and needs `ar`, `ur`, `fr`, `es` entries, with the key byte identical to the English (straight apostrophes, literal `&`, never `&amp;`).

### 3.10 Media library

**Route:** `/admin/media`

Upload with drag and drop, grid and list views, search by filename and alt text, folders or tags, per file alt text (required before an image can be attached to a post, which feeds the SEO audit), replace file keeping the same URL, a usage view showing which posts, jobs or pages reference a file, and a delete that refuses when the file is in use. Validate type by sniffing content, cap size, and **reject SVG uploads** outright, since SVG is a script execution vector.

### 3.11 Users, settings, audit

**Routes:** `/admin/users`, `/admin/users/invite`, `/admin/settings`, `/admin/audit`

Users list with role, status, last login and MFA state. Invite, resend invite, revoke invite, change role, deactivate, and delete with an ownership transfer prompt. Settings covering site facts, contact recipients, email templates, notification preferences, retention windows and feature toggles. Audit log covering every mutation with actor, action, entity, before and after diff, IP and timestamp, filterable and exportable, and **append only**, with no delete action in the UI for any role.

---

## 4. Approved dependencies

Add only from this list. Anything else, ask first in one line, then carry on with the rest of the work while you wait.

```
drizzle-orm  drizzle-kit  @neondatabase/serverless (or pg)
next-auth@beta + @auth/drizzle-adapter   [conditional, see §2]
argon2 (or bcryptjs if argon2 will not build on the target platform)
jose  otplib  qrcode
@upstash/ratelimit  @upstash/redis
resend  @vercel/blob
remark  remark-parse  remark-rehype  rehype-sanitize  rehype-stringify
recharts   [only if hand rolled SVG genuinely will not do]
vitest (or node:test)   [unit tests only]
```

Do not add: a UI component kit, a CSS-in-JS library, a table library, a form library, a state management library, a WYSIWYG editor, a date picker library, or an icon package. The project's stated position is minimal dependencies and hand built UI. Match it.

---

## 5. Integration with the public site

### 5.1 The repository layer, read this twice

The public marketing site must **never** hard fail because the database is unreachable. It is the company's lead generation front door and it currently has zero runtime dependencies.

Build `src/lib/repo/{posts,jobs,services,industries,products,about,site,seo,settings}.ts`. Each function:

1. Reads from the database, wrapped in the Next 16 caching primitive you confirm from `node_modules/next/dist/docs/`, tagged per entity (`posts`, `post:<slug>`, `jobs`, and so on).
2. On any error or timeout, catches, logs, and **returns the existing typed data from `src/lib/*.ts`**.
3. Never throws to the caller.

Keep every existing `src/lib/*.ts` content file in the repo as the seed and the fallback. Do not delete them. Page components change from importing the file directly to awaiting the repo function, and nothing else about them changes.

Publishing anything in the dashboard calls `revalidateTag` for the affected tag. Verify the exact Next 16 semantics in the local docs before relying on them.

### 5.2 Route and middleware changes

- `/admin/*` and `/api/admin/*`: session gate in `middleware.ts`, `X-Robots-Tag: noindex, nofollow`, excluded from `sitemap.xml`, disallowed in `robots.txt`, and no `<link rel>` or nav link to them from any public page.
- The existing host based noindex logic in `middleware.ts` must keep working exactly as it does now.
- Add the DB redirect lookup and the IP blocklist check to the same middleware, ordered so the cheapest check runs first. Keep the middleware fast: do not make a database round trip on every public request, cache the redirect map with a short TTL.
- **Do not rename `middleware.ts` to `proxy.ts` in this task.** It is roadmap item §9.4, and mixing it into an auth change makes the diff impossible to review.
- `path-to-regexp` in `next.config.ts` `source` rejects non capturing groups, per `HANDOFF.md` §7. Use capturing groups.

---

## 6. Dashboard design system

### 6.1 Shell and layout

A fixed left sidebar with grouped navigation, collapsible to icons, and a top bar carrying breadcrumbs, global search, the theme switcher, notifications and the user menu. On tablet and mobile the sidebar becomes an off canvas drawer with a hamburger, closing on link click, on outside click, on `Escape`, and on route change. The content area is a max width container with consistent page headers. Destructive actions always require an explicit or typed confirmation.

### 6.2 Responsiveness

Same matrix as `HANDOFF.md` §9.1: **360, 375, 414, 768, 1024, 1280, 1440**, in light and dark. No horizontal scroll at any width. Tap targets at least 44 by 44 CSS pixels. Data tables collapse to stacked cards below 768. Forms go single column below 768. Modals become full screen sheets on mobile. Long tables scroll inside their own container, never the page body.

Use **CSS logical properties** (`margin-inline`, `padding-inline`, `inset-inline`) throughout the admin CSS. The console is LTR English only for now, and logical properties mean adding RTL later is a token change rather than a rewrite.

### 6.3 Theming

The dashboard must match the DevelMo design system by default and offer alternative themes.

- Implement as `data-admin-theme="<name>"` on the admin shell element, with each theme a complete set of CSS custom properties. Never hardcode a colour in a component.
- Ship these: **DevelMo Light** (default, the brand palette: `#0fb2f2` blue, `#021c26` ink, `#3df2e0` teal used only on dark surfaces, `#0a8576` teal for text on light, `#085a8c` accent, `#032940` ink2, `#EAF7FF` tint), **DevelMo Dark**, **Midnight** (deep ink, low luminance, for night work), **Slate** (desaturated neutral grey with brand blue as the single accent), and **High Contrast** (WCAG AAA oriented, for accessibility).
- Every theme obeys §5.5. No purple in any theme, no gradient text, no glassmorphism, in any theme.
- A "System" option follows `prefers-color-scheme`.
- Persist per user in the database, mirror to a cookie for a no flash server render, and use the same inline no flash script pattern already in `layout.tsx`. Switching themes must not reload the page.
- The admin theme is independent of the public site theme. Changing one must not change the other.

### 6.4 Interaction quality

Loading skeletons, not spinners, for list and detail views. Optimistic UI on toggles and status changes, with rollback and a toast on failure. Empty states that explain and offer the primary action. Error states that say what failed and offer a retry. An unsaved changes guard on every form. Keyboard shortcuts for the common paths (`/` focuses search, `g` then `p` goes to posts, `Escape` closes overlays). Toasts for every mutation result, success and failure alike.

### 6.5 Accessibility

Semantic landmarks, one H1 per page, labels tied to every input with `htmlFor`, `aria-invalid` and `aria-describedby` on errors, visible `:focus-visible` rings everywhere, focus trapped in modals and returned to the trigger on close, `aria-live` regions for toasts and async results, full keyboard operation with no mouse only controls, and AA contrast minimum in every shipped theme. Run an axe pass before you call the work done.

---

## 7. Security requirements

Non negotiable, and each one is testable.

1. Passwords hashed with **argon2id** (or bcrypt cost 12 if argon2 will not build). Never logged, never returned, never stored reversibly.
2. Session cookies: `httpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix, rotated on privilege change, with both an idle timeout (8 hours) and an absolute timeout (30 days).
3. **CSRF protection on every mutating request.** Verify what Next 16 Server Actions give you by reading the local docs, and add an explicit origin check plus a double submit token for anything they do not cover, including all route handlers.
4. Rate limit login, signup redemption, password reset, MFA verification, all public form posts, and file uploads. Per IP and per account.
5. Timing safe comparison on all token checks. Generic messages on all auth failures, with no account enumeration through response bodies, status codes or timing.
6. Every mutation writes an audit row. The audit log is append only, with no delete path in code.
7. Authorisation checked server side on every request. Assume every client control has been bypassed.
8. All input validated with zod at the server boundary, including query parameters, path parameters and any headers you read.
9. Uploads: allowlist content types by sniffing bytes, cap size, strip metadata, store in Blob under unguessable keys, serve through short lived signed URLs, reject SVG.
10. All markdown sanitized on render with `rehype-sanitize`. Never `dangerouslySetInnerHTML` on unsanitized content.
11. Parameterised queries only, which Drizzle gives you. No string interpolated SQL anywhere.
12. Secrets in environment variables only, never committed, never in a `NEXT_PUBLIC_` variable. The only public keys are the Turnstile site key and anything genuinely client safe.
13. **Do not modify the existing public CSP.** Path scope any admin specific header to `/admin`. Nonce work is §9.2.1 and out of scope.
14. Admin routes carry `noindex, nofollow`, are absent from the sitemap, and are disallowed in robots.
15. IPs stored hashed with a server side salt. PII retention configurable and documented.

---

## 8. Environment variables

Add a `.env.example` with every variable and no real values, and extend `HANDOFF.md` Appendix A with the same table.

```
DATABASE_URL                    Postgres connection string          required
AUTH_SECRET                     session and token signing secret    required
ADMIN_BOOTSTRAP_EMAIL           first Owner account email           bootstrap only
ADMIN_BOOTSTRAP_TOKEN           gate for the bootstrap script       bootstrap only
RESEND_API_KEY                  transactional email                 required for invites and resets
CONTACT_TO / CONTACT_FROM       existing contact form addresses     existing
UPSTASH_REDIS_REST_URL          durable rate limiting               required
UPSTASH_REDIS_REST_TOKEN        durable rate limiting               required
BLOB_READ_WRITE_TOKEN           Vercel Blob media storage           required
CRON_SECRET                     protects the scheduled publish route required
PSI_API_KEY                     PageSpeed Insights runs             optional
TURNSTILE_SECRET                existing, now toggleable in the UI  optional
NEXT_PUBLIC_TURNSTILE_SITE_KEY  client widget key                   optional
E2E_BASE_URL                    Playwright target                   local only
```

Never commit a real value. The owner sets these in Vercel.

---

## 9. Testing and definition of done

Extends `HANDOFF.md` §10. All of it must pass before you hand anything back.

1. **`npm run build` green.** All 57 existing public routes still build and still typecheck, plus the new admin routes.
2. **`npx playwright test` with the existing suite at 28 of 28, with no existing test modified.** If an existing test needs changing, you have broken something. Fix the code, not the test.
3. **New suite `e2e/admin.spec.ts`**, covering at minimum: login success and failure, rate limited login, MFA challenge, invite redemption, expired invite rejection, RBAC denial for a Viewer against a mutating endpoint, unauthenticated redirect and post login return, create and publish a post and see it on the public route, unpublish and see a 404, create a job and see it at `/jobs/<slug>` with valid JSON-LD, submit the public contact form and find it in the inbox, apply an SEO override and see it in the served HTML, add a redirect and follow it, theme switch persisting across a reload, and the admin shell rendering without overflow at 360, 768 and 1280.
4. **Unit tests** for every zod schema, the RBAC matrix, the slug generator, the redirect loop detector, and the session and token helpers.
5. **Locale leak check** still returns zero residual English on `ar` and `fr` for the public routes, with `<head>` and `<script>` stripped. Admin routes are exempt and English only by decision.
6. **No new console errors or React warnings** on any public or admin route, including key warnings and hydration mismatches.
7. **Responsive pass** across the §6.2 matrix in both light and dark, with the public site verified unchanged at the same widths.
8. **Do not verify by screenshot.** `HANDOFF.md` §7: the homepage hero slider never reaches an idle frame and screenshot tools time out. Use DOM inspection, Playwright assertions and `curl`.
9. **Migration is reversible.** The seed script populates the database from the existing `src/lib` files, a documented rollback exists, and the public site is proven to render correctly with the database deliberately unreachable.
10. `npm run lint` clean.

---

## 10. Phasing

A working, buildable, committable state at the end of every phase. Do not start a phase before the previous one builds and its tests pass.

| Phase | Work | Done when |
|---|---|---|
| 0 | Recon. Read the codebase and the Next 16 local docs. Confirm the Auth.js v5 decision or fall back. Write the schema plan and the route map. | You post a short plan and the auth decision with evidence. |
| 1 | Database, Drizzle schema, migrations, seed from `src/lib`, repository layer with fallback. **No UI yet.** | The public site renders identically from the database, and identically again with the database unplugged. |
| 2 | Auth: users, sessions, login, bootstrap, invites, reset, MFA, RBAC, middleware gate, audit log. | Auth e2e tests green. |
| 3 | Admin shell: layout, sidebar, top bar, theming, responsive, empty and loading and error states. | Shell responsive across the matrix, all five themes render, no dead controls. |
| 4 | Posts and knowledge base, media library, revisions, scheduling, preview. | Publish flow proven end to end on the public route. |
| 5 | Jobs, public job detail route, application form, applicant pipeline. | Job flow proven end to end including JSON-LD. |
| 6 | Submissions inbox, contact API rewrite, spam view, delivery replay, exports, digests. | An enquiry survives a total delivery outage. |
| 7 | SEO manager: overrides, redirects, sitemap, robots, schema, audit crawler. | An override and a redirect proven live on a public route. |
| 8 | Security manager: events, access control, rate limit config, headers viewer, dependency status. | A blocked IP gets a 403, and events are recorded. |
| 9 | Performance: vitals collection, PSI snapshots, asset report, bundle stats, cache controls. | Real vitals attributed to real routes. |
| 10 | Site content, navigation, translations manager, leak check runner. | Content edits reach the public site, leak check clean. |
| 11 | Polish, full test suite, axe pass, docs, handback package. | Everything in §9 passes. |

---

## 11. Handback

You do not deploy and you do not push. Produce:

1. A git patch, or a clear file by file list of everything added and changed.
2. A **migration runbook**: provision the database, set the environment variables, run migrations, run the seed, run the Owner bootstrap, verify, and roll back. Written so the owner can follow it without you.
3. A new **§11 in `HANDOFF.md`** documenting the dashboard the way that file documents the rest of the site: architecture, routes, roles, data model, gotchas you hit, and what is deliberately not done.
4. Appendix A extended with the new environment variables.
5. A test report: build output, Playwright results, unit results, lint, leak check, axe summary.
6. A short list of anything you deliberately left out, one reason each.

---

## 12. Decisions for the owner, do not make these alone

Flag these in your final report rather than deciding them:

- Which Postgres provider, which account owns it, and the cost tier.
- Who holds the Owner account, and what happens if they leave.
- Whether blog and job content moves fully off `src/lib`, or the files remain the source of truth for the seeded records.
- GDPR retention periods for enquiries, applicant CVs and IP data, and who the data controller contact is.
- Whether applicant CV storage needs a data processing agreement with Vercel.
- Whether to enable Turnstile now, which needs a Cloudflare account.
- The nonce based CSP work (§9.2.1), which stays out of scope here but becomes more valuable once an authenticated surface exists.

---

## 13. Anti patterns, do not do these

- Do not scaffold with `create-next-app` or overwrite existing config files. This is an existing, live codebase.
- Do not restyle, refactor or "improve" any public page. If you notice a bug in one, report it, do not fix it in this diff.
- Do not add an open public registration route anywhere.
- Do not weaken the existing security headers or the CSP.
- Do not hand edit `src/lib/i18n/data.ts`.
- Do not migrate anything to `next/image` in this task, per `HANDOFF.md` §7 and §9.4.
- Do not rename `middleware.ts` to `proxy.ts` in this task.
- Do not leave mock data, stub handlers, `TODO` comments or commented out code in the handback.
- Do not ship a control that does nothing.
- Do not use em dashes or en dashes in any copy, label, email template or seed content you write. Use commas.
- Do not report the work as done until every item in §9 actually passes. If something fails, say what failed and why.

---

## 14. Communication while you work

- Before your first tool call, one sentence on what you are about to do.
- At the end of each phase, a short status: what landed, what the tests say, what is next. Nothing longer.
- Raise blockers immediately, in one or two sentences, then keep working on anything not blocked by them.
- No progress narration between those points.
