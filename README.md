# DevelMo Website

Marketing website for **DevelMo**, an AI, software and digital transformation company.
Built to be fast, SEO-ready, secure, and editable by non-developers through a headless CMS.

Brand: **AI That Fits Your Business.**

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + a small brand component layer (`globals.css`) |
| Fonts | Raleway (headings, via `next/font`) + system stack (body) |
| Content / CMS | Sanity (headless) — content model defined; connect with env vars |
| Forms | Server route + zod validation + honeypot + rate limit + optional Google reCAPTCHA v3 |
| Hosting | Vercel (preview per branch + production), domain on Hostinger |
| Tests | Playwright end-to-end suite |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values as needed (all optional for local dev)
npm run dev                  # http://localhost:3000
```

Scripts:

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint
- `npm run test:e2e` — Playwright e2e (expects the app running; set `E2E_BASE_URL` if not on :3007)

## Project structure

```
src/
  app/                # routes (App Router)
    page.tsx          # home
    about, services, services/[slug], products, products/crowdiq,
    industries, case-studies, blog, blog/[slug], careers, contact,
    privacy, terms, cookies, not-found
    api/contact/route.ts   # contact form handler
    sitemap.ts, robots.ts  # SEO endpoints
  components/         # SiteHeader, SiteFooter, Dashboard, ContactForm, PageHero, CtaBand, ui, icons
  lib/               # site.ts (brand/nav/services/products), content.ts, posts.ts, contact-schema.ts
```

Content today lives in typed files under `src/lib`. These are shaped to map 1:1 onto the
Sanity content model so pages can be switched to fetch from the CMS without redesigning them.

## Content & CMS (editing without a developer)

The intended editing model:

- **Content** (page text, images, SEO titles/descriptions, blog posts, case studies, FAQs,
  pricing copy, careers) is edited in **Sanity Studio** and published with no code deploy.
- **Design / new section types / features** are changed in code, previewed on a Vercel URL, then merged.

To connect Sanity: create a Sanity project, set `NEXT_PUBLIC_SANITY_PROJECT_ID` /
`NEXT_PUBLIC_SANITY_DATASET`, and the content schema is wired in. Until then, the site renders
from the seed content in `src/lib` so it always works.

## SEO

- Per-page metadata via the App Router `metadata` / `generateMetadata` API.
- `sitemap.xml` and `robots.txt` generated automatically (`src/app/sitemap.ts`, `robots.ts`).
- JSON-LD: Organization (site-wide) and Article (blog posts).
- Clean, lowercase, hyphenated slugs. Canonical via `metadataBase`.
- An SEO editor only needs the CMS: titles, descriptions and headings are content fields.

## Security

- Security headers + Content-Security-Policy in `next.config.ts` (HSTS, X-Frame-Options,
  nosniff, Referrer-Policy, Permissions-Policy).
- Secrets only in env vars (never shipped to the browser). `poweredByHeader` disabled.
- Contact form: zod validation, honeypot field, in-memory rate limit, optional reCAPTCHA v3 (invisible, score-based).

## Deployment (Vercel + Hostinger domain)

The **live WordPress site on Hostinger stays untouched** until cutover is approved.

1. Push to GitHub. Import the repo into Vercel. Add env vars from `.env.example`.
2. Every branch gets a preview URL; `main` deploys production.
3. **Staging on the real domain (safe):** add `staging.develmo.com` in Vercel, then in Hostinger
   DNS add `CNAME staging -> cname.vercel-dns.com`. The apex domain still serves WordPress.
4. **Cutover (later):** lower TTL, back up WordPress, then in Hostinger DNS set
   `A @ -> 76.76.21.21` and `CNAME www -> cname.vercel-dns.com`. Keep DNS at Hostinger to
   preserve email (MX). SSL provisions automatically.
5. **Rollback:** revert the `A`/`CNAME` records to the saved Hostinger values.

## Migration (from WordPress)

- Back up WordPress files + database and export media before any DNS change.
- Audit all existing URLs and finalize the 301 map in `next.config.ts` (`redirects`).
- Test forms, mobile, metadata, sitemap, robots, speed and links on staging first.
- Launch in a low-traffic window; keep the WordPress instance for ~2 weeks as a fallback.
