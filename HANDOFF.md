# DevelMo Website — Engineering Handoff & Continuation Guide

> **Purpose.** This is the single source of truth for continuing work on **develmo.com**. It is written to be read by **both a human developer and Claude Code**. Chats in Claude Code are not persisted, so treat this file as the durable memory of the project: what it is, how it is built, everything done so far, the rules to keep, and the direction to continue (responsiveness, security, authentication, and more).
>
> **If you are Claude Code:** read this file fully **and** `AGENTS.md` before editing anything. This is a **live production site** — every push to `main` deploys to the real domain within ~30s. Verify before you push (see §10).

---

## 0. How to use this handoff (start here)

**Where things are / who does what**
- **You develop against a local copy** of this codebase (provided to you separately). The **GitHub repo, Vercel project, and DNS are owned and operated by DevelMo** — you do not need, and will not have, direct access to them.
- **Your workflow:** build the feature locally → **verify per §10** (build + e2e + locale leak-check) → hand the changed files back to the DevelMo owner (as a git patch/diff, a zip of changed files, or a clear file-by-file summary). The owner reviews and deploys.
- **Deployment is the owner's step**, not yours: the owner pushes to `main` and Vercel auto-deploys to `https://develmo.com` in ~30s. The site is **already live** there.

**First prompt to give Claude Code in a fresh session** (copy-paste):
```
Read HANDOFF.md and AGENTS.md in full before doing anything.
This is a live production site: pushes to main deploy immediately.
Follow the conventions in HANDOFF.md §5 and §7. When you make a change,
verify it per §10 (build + e2e + locale leak-check) before I hand it back
to the owner to deploy. Today's task: <describe task>.
```

**Ground rules**
1. **Live site.** The owner deploys. Only hand back changes that pass §10 — a bad change reaches develmo.com within seconds of the owner pushing.
2. **Next.js 16 is not the Next.js in your training data.** Read `node_modules/next/dist/docs/` for anything version-specific. App Router, RSC, async server components, Turbopack.
3. **Keep the design language** (§5.5) — the brand deliberately avoids "AI-generated" tells.
4. **Don't break i18n** — every user-visible string must go through `t()`/`loc()` (§5.2).

---

## 1. What DevelMo is (business context)

DevelMo is a UK-registered AI / computer-vision software company (offices UK, Australia, Saudi Arabia, Pakistan; clients in 23+ countries). This site is its **marketing + lead-generation** website — the primary conversion goal is **"Book a Free Consultation"** (contact form enquiries).

- **Products** (real, shipped): **CrowdIQ** (live AI video analytics — the flagship), **OmniRoad 2.0** (road-safety AI, coming soon), **PadelIQ** (sports/padel analytics, coming soon).
- **6 service pillars / 21 services**, **10 industries**, blog/knowledge-base, careers, legal pages.
- HQ: 20 Wenlock Road, London N1 7GU. Contact: `info@develmo.com`.
- This was a migration from a developer-dependent WordPress site to a modern, CMS-ready platform. The original site's URL structure was mirrored on matching slugs so SEO migration needs ~no redirects.

---

## 2. Tech stack & hosting

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.9** (App Router, Turbopack, React Server Components) |
| UI runtime | **React 19.2** + TypeScript 5 |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) + a large bespoke `src/app/globals.css` (design tokens, components, RTL block, dark mode) |
| Fonts | `next/font/google` — **Raleway** (headings, `--font-raleway`) + **Hanken Grotesk** (body, `--font-hanken`) |
| Validation | **zod v4** (contact form) |
| Tests | **Playwright** e2e (`e2e/site.spec.ts`) |
| Hosting | **Vercel** (auto-deploy on push to `main`) |
| DNS | **Hostinger** (apex `A → 216.198.79.1`, `www CNAME → cname.vercel-dns.com`, `TXT _vercel` verification). Email MX/SPF/DKIM/DMARC untouched at Hostinger. |
| Email delivery (form) | **FormSubmit** (no-account) → `s.shahzeb8874@gmail.com`; Resend/webhook are upgrade paths |

Dependencies are intentionally minimal (no UI kit, no CMS SDK yet, no auth lib yet).

---

## 3. Repository layout (where everything lives)

```
develmo-web/
├─ AGENTS.md / CLAUDE.md   # Next-16 caveat (CLAUDE.md just @-includes AGENTS.md)
├─ HANDOFF.md              # THIS FILE
├─ next.config.ts          # security headers + CSP, 301 redirects, static-asset caching
├─ playwright.config.ts    # e2e config (baseURL from E2E_BASE_URL, default :3007)
├─ e2e/site.spec.ts        # 28 e2e tests (routes load, links, nav, CTA, contact form)
├─ public/                 # logos, og.jpg, hero-1/2/3.mp4 + posters, /clients /cards /products /crowdiq images
└─ src/
   ├─ proxy.ts             # X-Robots-Tag noindex on non-develmo.com hosts
   ├─ app/
   │  ├─ layout.tsx        # <html lang dir>, fonts, MegaNav, main, SiteFooter, StickyCta, Org JSON-LD, no-flash theme script
   │  ├─ globals.css       # all styling (tokens, components, RTL, [data-theme=dark])
   │  ├─ page.tsx          # homepage (hero → clients → products → solutions → industries → why)
   │  ├─ what-we-do/…      # pillar hub + [slug] service detail
   │  ├─ who-we-help/…     # industries hub + [slug] industry detail
   │  ├─ our-products/…    # products hub + [slug] + crowdiq/ (bespoke flagship page)
   │  ├─ who-we-are/…      # about hub + about-develmo
   │  ├─ our-blogs/…       # blog list + [slug] post
   │  ├─ our-knowledge-base/, jobs/, case-studies/, contact-develmo/
   │  ├─ privacy/, terms/, cookies/, not-found.tsx
   │  └─ api/contact/route.ts   # contact form endpoint
   ├─ components/          # MegaNav, SiteFooter, PageHero, CtaBand, StickyCta, HeroStage,
   │                       #   ProductSlider, ProductCollage, Dashboard, ContactForm, ThemeToggle, ui, icons
   └─ lib/                 # TYPED CONTENT + helpers (the CMS-shaped data layer)
      ├─ site.ts           # company facts, nav, social, offices, stats, tech
      ├─ services.ts       # 6 pillars + 21 services (+ helpers)
      ├─ industries.ts     # 10 industries
      ├─ products.ts       # 3 products
      ├─ about.ts          # who-we-are + about-develmo content
      ├─ posts.ts          # 3 blog posts (bodies are English-only content)
      ├─ contact-schema.ts # zod schema for the form
      ├─ meta.ts           # pageMeta() — per-page OG/Twitter/canonical
      ├─ i18n.ts           # client-safe: t(), loc(), isRtl, locales, localeLabels
      ├─ i18n-server.ts    # getLocale() (reads `locale` cookie)
      └─ i18n/
         ├─ data.ts        # auto-generated uiMessages + contentLocale (~724 KB)
         └─ extra.ts       # supplementary UI translations (300 keys/lang), hand-merged
```

**Content principle:** all page content lives in **typed `src/lib/*.ts`** files, shaped so it can later be swapped onto a Sanity CMS with minimal churn. Components read from these files; they do not hardcode content (with the deliberate exceptions of a few bespoke pages like `crowdiq`).

---

## 4. Local dev, build, test, deploy

```bash
npm install
npm run dev            # dev server (Next dev, default http://localhost:3000)
npm run build          # production build — ALSO typechecks + statically analyses all 57 routes
npm start              # serve the production build (next start; add -p 3010 to pick a port)
npm run lint           # eslint
npm run test:e2e       # Playwright — needs a running server; see below
```

**Running e2e correctly** (Playwright has no managed server; `baseURL` defaults to `:3007`):
```bash
npm run build
npx next start -p 3010 &                 # or any free port
E2E_BASE_URL=http://localhost:3010 npx playwright test
```

**Deploy is owned by DevelMo, not the contributor.** You develop and **verify locally** (§10), then hand your changed files / a git patch back to the owner. The owner pushes to `main`, and Vercel auto-deploys to production (~30s–2min). If you want a shareable preview of risky work, ask the owner to push it as a branch (Vercel gives branch previews their own `noindex` URL).

---

## 5. Core systems (read before editing)

### 5.1 Content architecture
Typed content in `src/lib/*.ts`. `Service`, `Industry`, and `Product` types carry optional `outcomes[]`, `faqs[]`, `intro`, `howItWorks[]` — detail pages render them with guards and emit **FAQPage JSON-LD**. To add/edit content, edit these files (not the JSX). This layer is intentionally Sanity-ready (see §9.4).

### 5.2 Internationalisation (i18n) — **the most important convention**
5 locales: **`en` (default), `ar` (RTL), `ur` (RTL), `fr`, `es`.** Locale is **cookie-based** (`locale` cookie set by the Languages switcher in the header/footer, which reloads the page). There is **no URL prefix** — every language shares the same URL.

- **`src/lib/i18n.ts`** (client-safe, no `next/headers`):
  - `t(text, locale)` — UI/chrome dictionary lookup. **English string is the key.** Order: `uiMessages[locale][text] ?? extraMessages[locale][text] ?? text` (English passthrough fallback). `en` returns the text unchanged.
  - `loc(base, locale, type, key)` — merges an English **content object** with its locale override from `contentLocale` (used for services/industries/products/about).
  - `isRtl(locale)`, `locales`, `localeLabels`.
- **`src/lib/i18n-server.ts`**: `getLocale()` reads the cookie (server components only).
- **`src/lib/i18n/data.ts`**: machine-generated `uiMessages` (UI dict) + `contentLocale` (content overrides). Large; don't hand-edit.
- **`src/lib/i18n/extra.ts`**: supplementary UI dictionary, **300 keys per language**, hand-merged. This is where newly-wrapped strings' translations live.
- `layout.tsx` sets `<html lang dir>`; `globals.css` has an RTL block for `ar`/`ur`.

**How to add a new user-visible string (do this every time):**
1. Wrap it at the render site: `{tr("Your English string")}` where `const tr = (s: string) => t(s, locale)` and `const locale = await getLocale()` (the component must be an **async server component**; client components receive `locale` as a prop — see `MegaNav`, `HeroStage`, `ContactForm`).
2. Add its translations to `extra.ts` for `ar`/`ur`/`fr`/`es`. **The key must be byte-identical** to the English string you wrapped (straight apostrophes `'`, literal `&`, no `&amp;`).
3. Shared components **PageHero** and **CtaBand** already translate their props centrally — pass plain English `title`/`subtitle`/`crumbs`/`text` and they localise them. `CtaBand` takes a `titleText` string for custom highlighted titles (English keeps the `<span className="hl">` flair; non-en uses `titleText`).

**Translating many strings at once** — the proven workflow (used this session): collect the exact English strings into a JSON array, run a translation pass (per-language translate + a native back-translation critic), then **merge into `extra.ts` via a Python script** using dict semantics to dedupe (`html.unescape` keys/values to fix any `&amp;`, write UTF-8). Verify with the **locale leak-check** (§10).

> **RSC gotcha:** React `key={...}` props serialise the English source string into the RSC flight `<script>` payload. A naive "is this English present in the HTML" check will false-positive on those. Strip `<head>` **and** `<script>` blocks before checking for English leakage.

### 5.3 SEO
- **`src/lib/meta.ts` `pageMeta({title, description, path})`** → per-page canonical + Open Graph + Twitter (+ `OG_IMAGE` = `/og.jpg` 1200×630). Applied on all real pages. `layout.tsx` imports the same `OG_IMAGE` and sets `metadataBase` + defaults + Organization JSON-LD (`sameAs` = `site.social`).
- **OG artwork is generated — `npm run og`** (`scripts/generate-og.mjs`, Playwright + the vendored Raleway/Hanken latin variable fonts in `scripts/fonts/`). WhatsApp, iMessage and compact Slack rows draw the preview as a **square tile and centre-crop** the image, so the layout keeps every element inside the centred **600px safe square** of the full-bleed 1200×630 canvas — square crops lose nothing, wide cards show the whole thing, neither letterboxes. The script fails if any line exceeds the safe square. After changing the artwork, **bump `?v=` on `OG_IMAGE.url`**: WhatsApp/Facebook cache OG images by full URL and otherwise serve the old thumbnail for weeks.
- `sitemap.xml`, `robots.txt` generated. Detail pages emit **FAQPage** JSON-LD.
- **`src/proxy.ts`** sets `X-Robots-Tag: noindex` on any host that is not `develmo.com` (keeps `*.vercel.app` previews out of the index). *(Next 16 renamed the `middleware` file convention to `proxy`: the file exports `proxy(req)` and runs on the Node.js runtime.)*
- **Metadata/titles stay English** (static export, crawler-facing). Cookie-based i18n means **only English is crawler-visible/indexed** — see §9.4 for the URL-locale option.

### 5.4 Security (current state)
- **`next.config.ts` headers** on every route: `Content-Security-Policy`, `Strict-Transport-Security` (2y, preload), `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo off), `X-DNS-Prefetch-Control`. `poweredByHeader: false`.
- **CSP note:** currently allows `'unsafe-inline'` + `'unsafe-eval'` on `script-src` (needed for Next runtime + inline JSON-LD/theme script). Tightening to a **nonce-based CSP** is a known follow-up (§9.2).
- **Contact API (`src/app/api/contact/route.ts`):** zod validation, **honeypot** (`company_url`), **in-memory rate limit** (5/min/IP — per warm instance only), **optional Google reCAPTCHA v3** (invisible, score-based; active when `RECAPTCHA_SECRET_KEY` + `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` are set — see `src/lib/recaptcha.ts`). Delivery chain: Resend (if `RESEND_API_KEY`) → webhook (if `CONTACT_WEBHOOK_URL`) → **FormSubmit** default. QA submissions to `@example.*` are skipped.
- **Static-asset caching** (added this session): `Cache-Control: public, max-age=31536000, immutable` for `/public` media via `source: "/(.*)\\.(jpg|jpeg|png|gif|webp|avif|svg|ico|mp4|webm|woff|woff2)"`. HTML stays dynamic/no-store.
- **No authentication** anywhere (see §9.3).

### 5.5 Design system & brand rules (keep these)
Official palette (from DevelMo branding): main blue **`#0fb2f2`**, ink/dark **`#021c26`**, highlight teal **`#3df2e0`**, accent **`#085a8c`**, ink2 `#032940`, tint `#EAF7FF`. Tokens live in `globals.css` (`:root` + `@theme`). Dark mode via `[data-theme="dark"]` (toggle in header; no-flash inline script in `layout.tsx`).

**"No AI-generated tells" rules (the DevelMo owner's hard preferences — keep these):**
- **No purple / no blue→violet gradients**, **no gradient text**, **no glassmorphism/frosted blur**.
- **No em-dashes or en-dashes** in copy — use commas. (Applies to content and generated strings.)
- Teal as text on **light** surfaces must use the AA-safe **`#0a8576`**, never bright `#3df2e0`.
- Motifs: teal corner-brackets / CV bbox corner-ticks (`.bbox-frame`), mono "code-comment" labels (`// FEATURED`, `// LET'S BUILD`, `GLOBAL DELIVERY · LHR / SYD / RUH / KHI`) — these stay **English by design** (decorative), do not translate them.
- Headings Raleway, body Hanken Grotesk. One dominant CTA repeated everywhere: **"Book a Free Consultation."**

### 5.6 Key components
- **MegaNav** (`"use client"`, takes `locale`): full-width mega-menu (What We Do / Who We Help / Our Products / Who We Are panels) + Insights, utility strip (email, Knowledge Base, ThemeToggle, **Languages** switcher), mobile drawer, hamburger.
- **HeroStage** (`"use client"`): full-bleed **background video slider** of DevelMo's own CV clips (`hero-1/2/3.mp4` = PadelIQ/CrowdIQ/OmniRoad), auto-advances, only-active-plays, dual CTAs.
- **PageHero** / **CtaBand**: shared, **locale-aware** (translate their props). **StickyCta**: persistent "Let's Talk" tab/FAB. **ProductSlider** / **ProductCollage**: product video showcases. **ContactForm** (`"use client"`, localised): posts `/api/contact`, reads `?service/?industry/?intent` params for qualified CTAs.

---

## 6. Everything done in this chat (the migration record)

This session continued a long build. In chronological arc:

1. **Full site build** — 57 routes, all pages, mega-nav, hero video, dark mode, contact form, SEO infra, security headers, e2e. Content ported + rewritten from the old WordPress `develmo.com` into typed `src/lib`. (Products trimmed to 3; PadelIQ renamed from `rpf-padel-league`.)
2. **i18n system (v1)** — cookie-based 5-language system (en + ar/ur RTL + fr/es), `t()/loc()/getLocale()`, `data.ts`, RTL CSS, Languages switcher. Chrome + homepage + detail pages localised.
3. **Full multi-agent QA + deploy** — fixed 4 criticals (per-page OG/canonical via `meta.ts` + `og.jpg`; localised legal + contact form; middleware noindex; PadelIQ slug + redirect). **Deployed live**: pointed `develmo.com` (Hostinger DNS) at Vercel, replacing old WordPress. Email untouched.
4. **`www` fix** — `www.develmo.com` had been held by a *different* Vercel project (an old "Redefining Vision" build), so visitors on `www` saw the old site. Added `TXT _vercel = vc-domain-verify=www.develmo.com,…` to claim `www` for our project; it now 307-redirects to the apex serving our build. **Confirmed live.**
5. **This pass — i18n completeness + perf + social** (commit `99c91e8`):
   - Localised **all** remaining hardcoded strings: homepage why-cards/leads/pillars; the **entire CrowdIQ page**; jobs, case-studies, blogs/knowledge-base chrome, products badge, what-we-do, who-we-help, contact info, 404, MegaNav mega-panels, HeroStage tags, footer.
   - Made **PageHero** locale-aware and added **CtaBand `titleText`** (fixes every hero/breadcrumb/CTA centrally).
   - Translations via a workflow (4 translate + 4 native critic agents) → **`extra.ts` now 300 keys/language**.
   - **Social links** → real DevelMo profiles (LinkedIn `company/develmo`, Instagram `official_develmo`, Facebook `Develmo`, X `develmo_com`, YouTube `@DevelMo-tech`); fixes Organization `sameAs`.
   - **Static-asset immutable caching** in `next.config.ts`.
   - **Verified:** build green (57 routes), Playwright **28/28**, locale leak-check **0 residual English** across ar+fr, confirmed live.

---

## 7. Gotchas & hard-won lessons (don't relearn these)

- **RSC key false-positives** when checking for English leakage — strip `<script>` payloads (§5.2).
- **path-to-regexp** in `next.config.ts` `source` rejects non-capturing groups `(?:…)`. Use capturing groups: `/(.*)\\.(jpg|png|…)`.
- **Windows/Python encoding** — printing Arabic/Urdu to a cp1252 console throws; use `PYTHONIOENCODING=utf-8` and write files as UTF-8.
- **Screenshots of the homepage are unreliable** — the hero slider + pulse animations never reach an idle frame, so automated screenshot tools time out. Verify via DOM/e2e/curl, not screenshots.
- **`next/image` was avoided** — the logo collapsed to `width:0` inside flex containers. Plain `<img>` (with `eslint-disable @next/next/no-img-element`) is used deliberately. If migrating to `next/image`, set explicit `width`/`height` or `sizes` (§9.4).
- **Async server components:** wrapping strings often means converting a page to `async` and adding `const locale = await getLocale()`. Client components (`"use client"`) can't be async — pass `locale` as a prop instead.
- **YouTube background video** needs `youtube-nocookie` in the CSP `frame-src`.

---

## 8. Known limitations & open backlog

- **i18n SEO:** cookie-based locale = one URL for all languages, so **only English is indexed**. Non-English is a UX feature, not an SEO surface. Fix = URL-prefixed locales (§9.4).
- **Blog article bodies + post titles/excerpts stay English** (content, not chrome). Only blog *chrome* is localised.
- **Metadata (`<title>`/descriptions) stay English** (static, crawler-facing).
- **Native ar/ur review recommended** — translations are machine-generated + AI-critic-reviewed, not human-verified.
- **FormSubmit activation pending** — the **first real** contact submission triggers a one-time activation email to `s.shahzeb8874@gmail.com`; someone must click it once to enable delivery. (Or set `RESEND_API_KEY` for production email.)
- **Sanity CMS not yet connected** — content is Sanity-shaped but still lives in `src/lib` (§9.4). This was the original core goal (remove the developer bottleneck).
- **Rate limit is in-memory** (per serverless instance) — not robust across instances (§9.2).
- **Vercel/GitHub 2FA** not set up (recommended).
- **Domain auto-renew is OFF at Hostinger; expires 2027-01-21** — must be renewed manually.

---

## 9. Forward roadmap — the direction to keep

Continue in the same spirit: production-quality, brand-consistent (§5.5), verified before shipping (§10). Below, each area has concrete, prioritised steps.

### 9.1 Responsiveness
Current: Tailwind v4 + bespoke CSS; mega-nav has a desktop panel layout + mobile drawer; there is an RTL block. Do a systematic pass:
- **Test matrix:** 360 / 375 / 414 (mobile), 768 (tablet), 1024 / 1280 / 1440 (desktop) — **each in LTR and RTL (`ar`) and in light + dark.**
- **High-risk layouts to audit** (all in `globals.css`): `.hero-in` (2-col hero), `.imgcard-grid` (solutions/industries cards), `.mega-grid.cols4` (nav panels), `.foot-grid` (5-col footer) + `.foot-office-grid`, `.contact-grid`, the CrowdIQ `.price` cards and `.grid.g3`, `.hero-stats`, `.clients-marquee`.
- **Checks:** hero overlay text legibility on small screens; tap targets ≥ 44px; no horizontal scroll; RTL mirroring correct; the video hero performance on mobile (consider `preload`/poster).
- **Automate it:** add Playwright **projects** with mobile/tablet viewports (extend `playwright.config.ts`), and/or use the preview tooling's `preview_resize`. Add a couple of visual/DOM assertions per breakpoint so regressions are caught.
- **Definition of done:** no layout breaks or overflow across the matrix; e2e green including new viewport tests.

### 9.2 Security
Build on the solid header baseline. Prioritised:
1. **Tighten CSP to nonce-based** — remove `'unsafe-inline'`/`'unsafe-eval'` from `script-src`. Next 16 supports per-request nonces; move inline scripts (theme no-flash, JSON-LD) to nonce'd tags. Verify with Mozilla Observatory / `securityheaders.com`.
2. **Durable rate limiting** — replace the in-memory limiter in `api/contact/route.ts` with **Upstash Redis** (or Vercel KV) so limits hold across serverless instances. Consider Vercel WAF / firewall rules.
3. **reCAPTCHA v3 is configured** — a Score-based (v3) key is registered in the Google admin console under the `Develmo` GCP project (label `develmo.com`, site id `765673591`, domains `develmo.com` / `www.develmo.com` / `localhost`). Keys live in **`.env.local` locally only** — `.env*` is gitignored, so **`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` must be added to the Vercel project's environment variables** or the check silently stays off in production (the code no-ops without a secret). Verified: the full e2e suite passes with the keys live, so an automated Chrome scores above the 0.5 cut-off — the contact-submit test does not need a keyless server.
4. **Dependency hygiene** — enable Dependabot / run `npm audit`; keep Next patched (security releases are frequent).
5. **Secrets** — only in Vercel env; never commit. Rotate the FormSubmit target to a proper Resend domain for production email.
6. **Accounts** — enable 2FA on Vercel + GitHub.
7. **Headers polish** — consider `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` where safe.
- **Definition of done:** A/A+ on securityheaders.com and Observatory without breaking the app (test the theme toggle + JSON-LD + form after CSP changes).

### 9.3 Authentication
**There is no auth today** — the site is a public marketing site with no accounts or protected routes. Before building anything, **define the purpose** (this is a product decision, flag it to the DevelMo owner):
- **Likely use cases:** (a) a **CrowdIQ customer portal/dashboard** (login to view analytics) — this should integrate with the CrowdIQ product's own backend/auth, not a standalone system; (b) an **admin/CMS login** — largely solved by connecting **Sanity** (Studio has its own auth, §9.4); (c) **gated content** (per-product one-pagers, downloads).
- **Recommended options** (App-Router-compatible):
  - **Clerk** — fastest DX, hosted, built-in orgs/RBAC/MFA. Good for a customer portal.
  - **Auth.js (NextAuth v5)** — open-source, self-hosted, OAuth + credentials, full control.
  - **Supabase Auth** — if you also want a Postgres database alongside auth.
- **Implementation notes when the scope is set:** protect routes in `middleware`/`proxy`; sessions in **httpOnly, Secure, SameSite** cookies; rate-limit auth endpoints; keep CSP in mind (add the provider's domains to `connect-src`/`frame-src`); never store plaintext credentials; add auth flows to the e2e suite.
- **Do not** hardcode credentials or wire real auth without the scope decision. Start by writing a short RFC (which use case, which provider, which routes) and get sign-off.

### 9.4 Other high-value work
- **Connect Sanity CMS** (original core goal): create a Sanity project, define schemas mirroring the `src/lib` types (`Service`/`Industry`/`Product`/`Post`/`About`), build Studio at `/studio`, migrate content, and swap page data reads from `src/lib` to the Sanity client. This removes the developer bottleneck for content edits and gives non-technical staff editing + its own auth.
- **URL-prefixed locales for i18n SEO** (`/ar`, `/ur`, `/fr`, `/es`) + `hreflang` alternates + per-locale sitemap — makes all languages crawlable/indexable. Larger refactor (routing, links, proxy locale detection); scope it deliberately.
- **`next/image` migration** — for `/clients`, `/cards`, `/products`, product/blog imagery (mind the flex-collapse gotcha, §7). Pairs with the immutable caching already in place.
- **Analytics** — add privacy-friendly analytics (Vercel Analytics or Plausible); update CSP `connect-src` accordingly.
- **Accessibility** — skip link, `:focus-visible`, keyboard mega-nav are done; run axe, fix contrast (teal-on-light must be `#0a8576`), verify form labels + landmark structure.
- **Lead-capture backlog** (from the earlier CTA spec): sticky mini contact form, newsletter capture on blog, Calendly/Cal.com embed on contact, gated one-pagers, WhatsApp FAB.

---

## 10. Definition of done (verify every change like this)

For any change that touches pages, components, i18n, config, or content:

> **Stop your dev server first, or point the build elsewhere.** `next build` clears the whole dist directory including `.next/dev`, where a running `next dev` keeps its Turbopack state — doing both at once kills the dev server with `FATAL: An unexpected Turbopack error occurred` / `Next.js package not found`. To verify while dev stays up, run the build with **`NEXT_DIST_DIR=.next-build`** (supported by `next.config.ts`; ignored by git). Recovery if it does happen: stop every stray `next` process, `rm -rf .next`, restart.

1. **`npm run build`** — must be green (this typechecks + statically analyses all 57 routes).
2. **e2e** — `npm run build && npx next start -p 3010 & && E2E_BASE_URL=http://localhost:3010 npx playwright test` → **28/28** (add tests when you add behaviour).
3. **If you touched i18n:** run a **locale leak-check** — fetch the affected pages with `Cookie: locale=ar` and `locale=fr`, strip `<head>` + `<script>`, and assert the English strings you localised are **gone** (and RTL/`lang` correct for `ar`). Zero residual English on non-`en`.
4. **If you touched security/headers:** re-check `securityheaders.com` + confirm the theme toggle, JSON-LD, and contact form still work.
5. **If you touched responsiveness:** verify across the §9.1 matrix (LTR + RTL, light + dark).
6. Only then hand the change back to the DevelMo owner to review and deploy. **Live site — hand back only what passes the checks above.**

---

## 11. The admin console (the dashboard)

Added over eleven phases on top of `e0a9992`, the pre-dashboard baseline. The
brief is `DASHBOARD-BRIEF.md`; per-phase notes are in `docs/dashboard/`. The
migration runbook, written for the owner rather than for an engineer, is
`docs/dashboard/RUNBOOK.md`.

### 11.1 The one thing to understand first

**The database is an override, not a source of truth.** Every public page reads
through `repoQuery()` in `src/lib/repo/`, which tries the database, falls back
to the typed files in `src/lib` on error or timeout, and trips a circuit
breaker after repeated failures so a sick database costs one slow request, not
every request. Unplug Postgres and develmo.com serves exactly what it served
before this work existed. `tests/unit/repo-util.test.ts` asserts the fallback
on error and on timeout.

That is why the seed script is optional, why rolling back is easy, and why
none of this put the live site at risk.

### 11.2 Architecture

| Concern | Choice | Where |
|---|---|---|
| Database | Postgres. `@neondatabase/serverless` when the host looks like Neon, `pg` otherwise | `src/db/index.ts` |
| Schema and migrations | Drizzle ORM, `drizzle-kit generate` and `migrate` | `src/db/schema/`, `drizzle/` |
| Reads | `repoQuery({ keys, tags, revalidate, query, fallback })`, tag-invalidated | `src/lib/repo/` |
| Auth | Hand rolled. Argon2 passwords, JWT sessions in a `__Host-` cookie, TOTP second factor, single-use recovery codes | `src/lib/auth/` |
| Route protection | `requirePageUser()` for pages, `adminRoute()` for handlers, both server side | `src/lib/auth/current.ts`, `src/lib/auth/api.ts` |
| Validation | zod on every write, one schema per entity | `src/lib/schemas/` |
| Styling | One stylesheet, `src/app/(admin)/admin.css`, hand written, no framework and no component kit | |
| Charts | Hand rolled SVG. No chart library | |

Auth.js v5 was evaluated in phase 0 and rejected: it wanted control of the
session cookie and the sign-in flow, which conflicted with the existing
middleware and with the MFA and audit requirements. The decision and its
evidence are in `docs/dashboard/PHASE-0-PLAN.md`.

### 11.3 Routes

55 pages under `src/app/(admin)`, all beneath `/admin`, plus the handlers under
`/api/admin`. Nothing public was added, moved or renamed.

- `(auth)` group, no session needed: `/admin/login`, `/admin/signup`,
  `/admin/forgot-password`, `/admin/reset-password`. `/admin/mfa/enrol` and
  `/admin/mfa/verify` need a half-authenticated session, that is, the password
  step passed and the second factor still outstanding.
- `(shell)` group, session required: the dashboard, posts and the knowledge
  base, media, jobs and applications, submissions, SEO, security, performance,
  site content, translations, users, settings, account and the audit log.

`/admin` and `/api/admin` are excluded from `sitemap.xml` and disallowed in
`robots.txt` by a rule in code that the robots editor cannot override.

### 11.4 Roles

Four roles, checked server side on every page and every handler. The matrix
lives in `src/lib/auth/rbac.ts` and is unit tested.

| Role | Can |
|---|---|
| Owner | Everything, including users, security and destructive actions |
| Admin | Everything except transferring ownership |
| Editor | Content, posts, jobs, media, submissions. No users, no security, no settings |
| Viewer | Read only, everywhere |

Owner and Admin **must** hold a second factor. A session that has not cleared
it is redirected to `/admin/mfa/enrol` on every admin route, which is worth
knowing when writing tests, see §11.8.

### 11.5 Data model

The groups that matter:

- **Auth:** `users`, `sessions`, `invites`, `auth_tokens`, `recovery_codes`.
- **Content:** `content_entries` (one row per pillar, service, industry,
  product, about, and the site facts, stats and technologies, keyed by
  `entity` plus `key`, payload in `jsonb`), `posts`, `post_revisions`,
  `post_translations`, `media`, `translations`.
- **Jobs:** `jobs`, `applications`, `application_notes`, `application_events`.
- **Enquiries:** `submissions`, `submission_notes`.
- **SEO:** `seo_overrides`, `redirects`, `seo_audits`, `seo_audit_findings`.
- **Security:** `security_events`, `ip_rules`, `rate_limit_config`,
  `rate_limit_hits`, `dependency_audits`.
- **Performance:** `web_vitals`, `psi_snapshots`, `build_stats`.
- **Operations:** `settings`, `email_templates`, `audit_log`.

`audit_log` is append only. There is no delete path for it anywhere in the
codebase, deliberately.

### 11.6 Security

- Sessions in a `__Host-` prefixed, `HttpOnly`, `SameSite=Lax`, `Secure`
  cookie. Rotated on privilege change, revocable per session.
- CSRF: a double-submit token on every mutating handler, plus an Origin check.
- Argon2id password hashing. Rate limited sign-in with lockout and a
  `security_events` row per attempt.
- IP addresses are stored **hashed** with a server-side salt, never in the
  clear, in submissions, applications and the audit log.
- IP blocklist and allowlist enforced in `src/proxy.ts`, cached with a short
  TTL so there is no per-request database read. The console refuses to block
  the address the request came from without a typed confirmation.
- Applicant CVs go to private Vercel Blob storage and are served only through
  short-lived signed URLs.
- **The public CSP was never changed.** Response headers across eight public
  routes are byte identical to the pre-dashboard capture. The one path scoped
  addition is for `/admin` only.

### 11.7 Public site integration

Five things the console changes on the live site, each proven end to end:

1. **Content.** Services, industries, products and the about page render from
   `content_entries` when present, from the typed files otherwise.
2. **Posts and jobs.** `/our-blogs`, `/our-knowledge-base` and `/jobs` render
   database rows. A slug change writes a 301 into `redirects` automatically.
3. **SEO.** Per-route metadata overrides, redirects, sitemap membership,
   `robots.txt` and the Organization schema, all served without a rebuild.
4. **Translations.** `t()` reads database override, then `uiMessages`, then
   `extraMessages`, then English. The console never writes to `extra.ts` and
   never to the generated `data.ts`.
5. **Enquiries.** The contact form writes a `submissions` row **before**
   attempting delivery, so an enquiry survives a total outage of every
   delivery channel and can be replayed from the console.

### 11.8 Gotchas, learned the hard way

- **A function cannot cross the server-to-client boundary.** Passing
  `publicPath={(key) => ...}` into a client component made every content page
  fail to render with "Functions cannot be passed directly to Client
  Components". Props are data. Pass a string prefix and build the value in the
  client component.
- **An Owner or Admin session is not signed in until the second factor is
  cleared.** Skipping the MFA step in a test is not a login failure: every
  admin route quietly answers with a redirect stub to `/admin/mfa/enrol`. A
  whole-surface sweep written this way measured that single page 54 times and
  reported the console clean. `e2e/helpers/sweep.ts` now proves each route
  rendered its own page, with its own `h1` and no redirect stub, before any
  sweep is allowed to measure anything.
- **React hydration replaces DOM nodes after the load event.** axe-core
  reported "page must have a level-one heading" on pages that demonstrably had
  one, and reported it on different pages each run. `waitForQuietDom()` waits
  for mutations to stop before scanning. Any tool that walks the DOM after
  `load` needs the same treatment.
- **`.adm-root a { color: inherit }` outranked `.adm-btn-primary`.** Every link
  styled as a primary button rendered its label at 1.03:1 contrast, effectively
  invisible, and no human had noticed. Specificity beats intent; the rule is
  now `a:not(.adm-btn)`.
- **`npx next build` does not run npm's `postbuild` hook,** so
  `.next-build/build-stats.json` is never written and the build stats endpoint
  answers 400. Use `NEXT_DIST_DIR=.next-build npm run build`.
- **`path-to-regexp` rejects non-capturing groups** in `next.config.ts` header
  and redirect sources. Use capturing groups.
- **The vitals endpoint needs no CSP change.** `navigator.sendBeacon` to a
  same-origin path is covered by `connect-src 'self'`. This was verified
  rather than assumed.
- The reCAPTCHA keys are live in local development, so any test that posts to
  a protected public endpoint has to mint a real token in a browser page.

### 11.9 Deliberately not done

- **URL-prefixed locales.** Locale is still a cookie, so only English is
  indexed. Metadata, titles and SEO overrides are English only, by decision.
- **A nonce-based CSP.** Out of scope by the brief, and more valuable now that
  an authenticated surface exists. `'unsafe-inline'` and `'unsafe-eval'`
  remain in `script-src`, exactly as before this work.
- **`next/image`.** Explicitly excluded, see §7. The logo collapses to
  `width: 0` in flex containers. Separate roadmap item.
- **Translating the console.** Admin strings are English only, by decision,
  and are not in `t()` and not in `extra.ts`.
- **Moving blog and job content fully off `src/lib`.** The files remain the
  source of truth for the seeded records until the owner decides otherwise.

### 11.10 Decisions still with the owner

Recorded here so they do not get lost. None of these should be made by a
contributor.

1. Which Postgres provider, which account owns it, and the cost tier.
2. Who holds the Owner account, and what happens when they leave. There is a
   documented recovery path in the runbook, §10, and it needs database access.
3. Whether blog and job content moves fully off `src/lib`, or the files stay
   the source of truth for the seeded records.
4. GDPR retention periods for enquiries, applicant CVs and IP data, and who
   the data controller contact is. The console has retention settings; nobody
   has set a policy.
5. Whether applicant CV storage needs a data processing agreement with Vercel.
6. Whether to enable Turnstile, which needs a Cloudflare account and a CSP
   addition for `challenges.cloudflare.com`.
7. The nonce-based CSP work.
8. Whether to pin `axe-core` as an explicit devDependency. The accessibility
   suite loads it from `node_modules/axe-core`, where it arrives today as a
   transitive dependency of `eslint-config-next`. It is not on the approved
   dependency list in the brief, so it was not added; if that transitive
   dependency ever goes away, `e2e/admin-a11y.spec.ts` stops running.


---

## Appendix A — Environment variables (set in Vercel, never commit)
| Var | Purpose | Required? |
|---|---|---|
| `RESEND_API_KEY` | Production email delivery for the contact form | Optional (upgrade from FormSubmit) |
| `CONTACT_TO` | Recipient (default `s.shahzeb8874@gmail.com`) | Optional |
| `CONTACT_FROM` | From address for Resend | Optional |
| `CONTACT_WEBHOOK_URL` | Alternative delivery to a webhook | Optional |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3 site key (public; loads api.js + mints the token) | Optional (recommended) |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA v3 secret (server-side siteverify) | Optional (recommended) |
| `RECAPTCHA_MIN_SCORE` | Score cut-off 0.0-1.0, default `0.5` | Optional |
| `E2E_BASE_URL` | Target for Playwright (local only) | Local test only |
| `DATABASE_URL` | Postgres connection string for the admin console. Unset: the public site still renders from the typed files, the console reports it cannot reach the database | Required for the console |
| `DATABASE_DRIVER` | Set to `neon` to force the serverless HTTP driver for a host that does not contain `neon.tech` | Optional |
| `AUTH_SECRET` | Signs sessions and one-time tokens. `openssl rand -base64 32`. Changing it signs everyone out | Required for the console |
| `ADMIN_BOOTSTRAP_EMAIL` | Email address of the first Owner | Bootstrap only, unset afterwards |
| `ADMIN_BOOTSTRAP_TOKEN` | Gate on `npm run admin:bootstrap`. The script also refuses to run once any user exists | Bootstrap only, unset afterwards |
| `ADMIN_BASE_URL` | Absolute origin used in invitation, reset and confirmation emails. Falls back to `NEXT_PUBLIC_SITE_URL`, then `https://develmo.com` | Optional |
| `NEXT_PUBLIC_SITE_URL` | Canonical public origin | Optional |
| `FORMSUBMIT_URL` | FormSubmit endpoint base, default `https://formsubmit.co/ajax`. Tests point it at an unreachable host to prove a delivery failure never loses an enquiry | Optional |
| `UPSTASH_REDIS_REST_URL` | Durable rate limiting. Unset: a database-backed window is used instead | Recommended in production |
| `UPSTASH_REDIS_REST_TOKEN` | Pairs with the URL above | Recommended in production |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for media and applicant CVs. Unset: files are written to `./.data/media`, correct locally and wrong on Vercel | Required in production |
| `CRON_SECRET` | Protects `/api/cron/*`, and authorises the proxy to read the IP access rules. At least 16 characters. Unset: the cron route answers 503 rather than failing quietly | Required for scheduled publishing |
| `PSI_API_KEY` | PageSpeed Insights runs from the performance manager | Optional |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret. The site key is stored in the console, not here. Switching Turnstile on also needs `challenges.cloudflare.com` in `script-src` and `frame-src` | Optional |
| `NEXT_PUBLIC_VITALS_SAMPLE_RATE` | Share of public page views reporting Core Web Vitals, default `0.25`. Set to `1` in development | Optional |
| `NEXT_DIST_DIR` | Redirects the build output away from `.next` so a verification build can run while `next dev` is up. Local only, never set in Vercel | Local build only |

`VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are injected by Vercel on every deployment and are trusted by `src/lib/seo/origin.ts` when deriving the absolute origin. Do not set them yourself.

The complete list, with a comment on each, is `.env.example` at the repo root.

## Appendix B — External accounts & ownership (all owned by DevelMo, not the contributor)
> The contributor works from a **local copy** and hands changes back. No repo/Vercel/DNS access is granted; the owner performs all deploys and infra changes.
- **GitHub:** private repo owned by DevelMo (push to `main` = deploy).
- **Vercel:** DevelMo project (Hobby). Opted out of AI training.
- **DNS:** Hostinger (apex `A → 216.198.79.1`, `www CNAME → cname.vercel-dns.com`, `TXT _vercel`). **Email records (MX/SPF/DKIM/DMARC) must stay untouched.** Domain expires **2027-01-21**, auto-renew OFF.
- **Form email:** currently `s.shahzeb8874@gmail.com` via FormSubmit (activation click pending).

## Appendix C — The i18n cheat-sheet (most common task)
```
1. Wrap:   {tr("New English string")}    // tr = (s) => t(s, locale); locale = await getLocale()
2. Translate: add "New English string" -> ar/ur/fr/es in src/lib/i18n/extra.ts
3. Key must be byte-identical (straight ' , literal & , no &amp;)
4. Client component? pass `locale` prop instead of getLocale()
5. Hero/CTA? pass plain English to PageHero/CtaBand — they translate centrally
6. Verify: build + e2e + locale leak-check (strip <head> AND <script>)
```

---
*Last updated: this handoff reflects the site as of the i18n-completeness + social + caching pass (commit `99c91e8`), live on develmo.com.*
