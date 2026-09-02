# Phase 5 notes: job board, applications, applicant pipeline

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/{jobposting,documents}.test.ts` and
`e2e/admin-jobs.spec.ts` unless marked otherwise.

## Public routes

- `/jobs` is DB driven through `src/lib/repo/jobs.ts`. There is no typed
  file of jobs (the site listed none), so the fallback is an empty board and
  the page is byte identical to before until a role is open (asserted in the
  e2e: the careers page HTML before the first role equals the HTML after the
  role closes).
- `/jobs/[slug]` is new, built from `PageHero`, the contact page's two-column
  grid and `CtaBand`, so the existing localisation and dark mode apply.
  Every chrome string goes through `t()` with `ar`, `ur`, `fr`, `es` entries
  in `src/lib/i18n/extra.ts` (machine translated, native review recommended,
  like the rest of that file). Job content (title, summary, sections) stays
  as entered. The e2e leak check strips `<head>` and `<script>` and looks for
  twelve English sentinels on `/jobs` and `/jobs/<slug>` under `locale=ar`
  and `locale=fr`.
- **Closed, paused, not-yet-open, draft and unknown roles all return 404**,
  rendered by `src/app/(site)/jobs/[slug]/not-found.tsx` ("This role is no
  longer open" with a link to the careers page). The brief allowed 410 or
  404; 404 is the documented choice because the App Router cannot emit 410
  from a page, and one status for every non-open state means a URL never
  reveals whether a draft exists.
- `JobPosting` JSON-LD is built by `src/lib/jobposting.ts` and validated by
  `validateJobPosting` before it ships: the page emits the script only when
  the report has no errors, and the job editor shows the same report so
  staff see what is missing (an office for `jobLocation`, 50+ characters of
  description, and so on). Remote roles use `TELECOMMUTE` plus
  `applicantLocationRequirements`; salaries map to `MonetaryAmount` with the
  chosen period; hidden salaries are omitted.

## Applications

- `POST /api/jobs/apply` (multipart) runs the contact form's protections in
  this order: durable rate limit (`apply`, 5 per 10 minutes per IP, editable
  from the security manager later), honeypot (silently accepted, recorded as
  a `honeypot` security event), zod validation, open-job check, then the
  optional captcha, then the CV.
- **Captcha:** the brief says Turnstile; this codebase runs Google reCAPTCHA
  v3 on the contact form, so the application form uses the same integration
  with its own action (`apply`). Switching both forms to Turnstile is the
  security-manager toggle in §3.7 and is not done here.
- **CV:** PDF or DOCX decided from the bytes (`src/lib/documents.ts`), never
  from the name or the client's MIME type. PDFs carrying `/JavaScript`,
  `/JS`, `/Launch`, `/RichMedia` or `/EmbeddedFile` and DOCX files carrying
  `vbaProject.bin` (macro-enabled files in disguise) are refused. Stored
  under `cv-<32 hex>.<pdf|docx>` with private access; the serving route
  never releases a CV without a valid signed link.
- **Size cap 10 MB** as specified, enforced client side and server side.
  Note for the owner: Vercel functions accept request bodies up to about
  4.5 MB, so on Vercel a CV between 4.5 and 10 MB fails at the platform with
  the "try a smaller CV" message. Lifting that needs direct browser-to-Blob
  uploads, which needs `https://*.blob.vercel-storage.com` added to
  `connect-src` in the public CSP: a CSP change, so it is an owner decision,
  not done here.
- The row is written before the acknowledgement email is attempted, and the
  email runs after the response (`after()`); the outcome is recorded on the
  row (`ack_sent_at` or `ack_error`) so a mail failure never loses an
  applicant. Without `RESEND_API_KEY` the error reads "RESEND_API_KEY not
  configured".
- Consent is explicit and timestamped (`consent_at`); the applicant's locale
  is stored; the IP is stored hashed with the server-side salt.

## Pipeline (`/admin/applications`, `/admin/applications/[id]`, `/admin/jobs/[id]/applications`)

- Stages `new`, `screening`, `interview`, `offer`, `hired`, `rejected` with
  a note per change, written to `application_events` (the trail) and to the
  audit log. Rating 1 to 5, assignment to an active staff user, internal
  notes.
- CV download: `GET /api/admin/applications/cv?id=` returns a one-minute
  signed link (a presigned Blob GET in production, an HMAC link on the local
  backend) and writes an `application.cv_download` audit row, so access to
  personal data is traceable.
- Rejection: a modal prefilled from the editable `application_rejection`
  template (placeholders `{{first_name}}`, `{{name}}`, `{{job}}`,
  `{{company}}`), optionally saved back as the default; sending moves the
  stage to `rejected` and records whether the email actually went. Both
  templates are edited at `/admin/jobs/templates`.
- CSV export honours the page's filters and neutralises spreadsheet formula
  injection; each export is audited.
- Hard delete (retention requests) removes the row, its notes, its trail
  and the CV object; Admin and Owner only. **Owner decision:** the retention
  window for CVs and applications (the brief suggests 24 months as the
  documented default for enquiries); nothing expires automatically yet, that
  arrives with the submissions inbox and settings phases.
- A job with applications cannot be deleted (409); close it instead so the
  history stays intact.

## Jobs (`/admin/jobs`, `/new`, `/[id]`)

- Fields per the brief, including office tied to `src/lib/site.ts`
  (UK, AU, SA, PK), salary range with currency, period and a hide flag,
  four markdown sections with live preview, `opensAt`, `closesAt`, status,
  meta title, meta description, canonical override and noindex.
- `openedAt` records the first time a role went live and feeds
  `datePosted`. `closesAt` hides the role from the moment it passes; the
  cron (`/api/cron/publish`, now also closing due jobs) marks it `closed`
  and audits it.
- Slug change on a job does not write a redirect (the brief asks for that on
  posts only); a closed role's URL 404s regardless.

## Not done, on purpose

- No staff notification email on a new application; the digest and
  per-user notification preferences are the submissions inbox phase (§3.5).
- No Turnstile (see captcha above).
- No direct-to-Blob upload for CVs above 4.5 MB (CSP decision above).
- Vercel Blob for CVs (private objects, presigned downloads) is written but
  **untested locally**; the e2e exercised the disk backend.
