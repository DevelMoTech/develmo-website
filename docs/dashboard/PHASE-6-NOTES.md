# Phase 6 notes: submissions inbox and the contact API rewrite

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/delivery.test.ts` and
`e2e/admin-submissions.spec.ts` unless marked otherwise.

## The contact route, rewritten

`src/app/api/contact/route.ts` now does, in order:

1. the durable rate limit (unchanged, 5 per minute per IP);
2. JSON parse; honeypot check (a filled `company_url` still gets a silent
   `ok`, but the row is now **stored as spam** instead of discarded);
3. the unchanged zod `contactSchema`;
4. the optional reCAPTCHA (a rejection still answers the same `captcha`
   error, but the row is stored as spam so a wrongly flagged enquiry can be
   restored from the spam view);
5. **the database write**, with name, email, phone, company, message, the
   `?service`/`?product`/`?industry`/`?intent`/`?source`/`?topic`/`?region`
   qualifiers as columns, referrer, landing page, utm_* (normalised, keys
   without the prefix), locale (from the `locale` cookie), user agent,
   hashed IP and timestamp;
6. `ok: true` to the visitor;
7. **after the response**, the delivery chain, then instant digests.

The chain (`src/lib/submissions/delivery.ts`) tries Resend when
`RESEND_API_KEY` is set, then the webhook when `CONTACT_WEBHOOK_URL` is set,
then FormSubmit; the first success wins, every failure is kept in
`delivery_error` (for example `webhook: fetch failed (ECONNREFUSED);
formsubmit: fetch failed (ECONNREFUSED)`), and `delivery_status` ends as
`sent` (with `delivery_channel`), `failed`, or `skipped` (QA addresses and
spam). Each channel has an 8 second timeout. The delivered email text is
built from the row exactly as the old route built it, with the qualifiers
appended back as the `[Context] k=v` line, so the inbox email is unchanged.

**If the database itself is unreachable**, the route falls back to the old
behaviour: it runs the chain synchronously and only shows the visitor the
"could not send" error when that also fails. So the enquiry is lost only if
the database, Resend, the webhook and FormSubmit are all down at once.

**If the after-response chain never completes** (a cut-off callback, a
crash), the row stays `pending`; the cron's retry sweep picks up `pending`
rows older than five minutes and `failed` rows with fewer than three
attempts, runs the chain again and audits the sweep. Manual "Replay
delivery" is on top of that and has no attempt cap.

The webhook keeps its pre-rewrite payload shape (`firstName`, `lastName`,
`email`, `phone`, `company`, `budget`, `service`, `message`, `consent`, plus
`subject` and now `submissionId`); the stored row holds one name, so it is
split on the first space for that payload. The "Service:" line and the
"[Context] ..." line of the email come from two columns (`form_service`,
the visitor's select, and `qualifiers`, the raw URL values in the form's
order), which is what makes the delivered text identical to before.

QA addresses (`@example.*`) are stored, but arrive already `read`, tagged
`qa`, are never delivered, never digested and never counted in the badge, so
the site's own e2e run against production leaves no unread noise. Captcha
rejections keep Google's reason in the row (for example `verify-unreachable`),
so an outage that holds genuine enquiries as spam is visible at a glance.

The form (`src/components/ContactForm.tsx`) changed in one place: the fetch
payload gained `context`, `referrer`, `landingPage` and `utm`. No markup,
class, label, placeholder or validation message changed; the
`[Context] ...` line is still appended to the message text, and the route
strips it into columns (and still parses it for any older client).
`src/components/VisitCapture.tsx` in `SiteChrome` renders nothing; it
records the first page, external referrer and utm_* of a visit in
sessionStorage so attribution survives navigation to the contact page.

## Proving durability locally

`.env.local` (local only, never committed) now carries
`CONTACT_WEBHOOK_URL=http://127.0.0.1:59999/contact-webhook` and
`FORMSUBMIT_URL=http://127.0.0.1:59999/formsubmit` (both connection-refused),
and no `RESEND_API_KEY`. The durability e2e asserts those preconditions,
submits a non-QA enquiry, gets `{ ok: true }`, finds the row, then watches
`delivery_status` turn `failed` with both channel errors recorded. A side
effect worth knowing: local contact form submissions are never delivered
anywhere while those overrides are set. `FORMSUBMIT_URL` is documented in
`.env.example`; leave it unset in production.

## Inbox

- `/admin/submissions`: URL-backed table (status, kind, assignee including
  "me" and "nobody", service, intent, industry, tag, delivery status, from
  and to dates, free text over name, email, company, phone and message),
  CSV export of the current view (formula injection neutralised, each
  export audited), retention and reply template cards for `settings:write`.
- `/admin/submissions/spam`: honeypot, captcha and manual spam with the
  reason, "Not spam" per row. Restoring a contact enquiry that was never
  delivered runs the chain right then, so it reaches the inbox email too.
- `/admin/submissions/[id]`: message, contact, qualifiers, context
  (landing page, referrer, UTM, language, user agent, the IP hash prefix
  with its purpose stated), delivery card with the error text and a
  **Replay delivery** button, triage (status, assignment, tags), threaded
  internal notes (one level of replies), **Reply by email** as a `mailto:`
  prefilled from the configurable template, mark as spam, and hard delete
  for Admin and Owner (for an application's inbox row the pipeline record
  and its CV go too, and deleting from the pipeline removes the inbox row:
  a removal request is about the person, whichever side it starts from).
  Opening a new enquiry marks it read (audited); opening an application in
  the pipeline marks its inbox row read.
- Job applications land here too (kind `application`, linked to the
  pipeline record); newsletter is a supported kind with **no public source
  yet**: the site has no newsletter form, and adding one is a public route
  change for the owner to call.
- Sidebar badge: unread (`new`, non-spam) count on Submissions.
- Digest per user under Account: off, instant (one mail per submission,
  sent after the response) or daily (from the cron, at most once per 20
  hours, only when something arrived). Sent with Resend; without
  `RESEND_API_KEY` the send is logged and `digest_last_sent_at` is not set,
  so nothing is silently "sent".
- Retention: `settings.retention` (`submissionsMonths`,
  `applicationsMonths`, default 24 each, 0 keeps forever). The cron
  hard-deletes older enquiries and older applications (with their CVs and
  linked inbox rows) and writes one audit row per kind with the count. The
  cutoff is a calendar-month subtraction clamped to the month's last day.
  If the setting cannot be read the purge does not run at all: a default is
  never allowed to delete what the owner configured to keep.
  **Owner decision:** the defaults are a starting point; the brief flags
  GDPR retention for CVs and enquiries as yours to set.
- IPs: only the salted hash is stored, shown as a prefix with the reason
  ("stored for abuse prevention") on the detail page.

## Not done, on purpose

- No newsletter signup form (no public source exists; see above).
- Turnstile: the contact form keeps reCAPTCHA v3 as before; the toggle is
  the security manager phase.
- The instant digest cannot be observed in tests without a Resend key; the
  e2e proves the daily path from the cron (attempted, not marked sent).
