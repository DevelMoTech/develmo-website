# Phase 4 notes: posts, knowledge base, media library

Engineering notes for the owner and the next phases. Everything here is
implemented and covered by `tests/unit/{slug,post-schema,markdown,images}.test.ts`
and `e2e/admin-posts.spec.ts` unless marked otherwise.

## Content model

- One `posts` table with `type` (`blog` | `kb`). Slugs are unique per type, so
  `/our-blogs/x` and `/our-knowledge-base/x` can coexist.
- `post_translations` holds per-locale `title`, `excerpt`, `body_md` for
  `ar`, `ur`, `fr`, `es`. The public pages read the visitor's `locale` cookie
  and fall back field by field to English. Translations live in the database,
  never in `src/lib/i18n/extra.ts`.
- `post_revisions` stores a full snapshot (fields plus translations) with a
  `note` on every save, restore, bulk action and cron flip. Restoring writes a
  new revision rather than rewinding history.
- The three seeded posts in `src/lib/posts.ts` remain the seed and the
  fallback. Their public HTML is byte identical to the pre-phase output
  (`tests/unit/markdown.test.ts` proves the article markup, the e2e proves the
  page), except the `<head>`, which now carries the post's own canonical, OG
  and Twitter tags instead of the homepage defaults. That head change is
  required by the brief's acceptance criteria and is deliberate.

## Markdown

- remark + remark-rehype + rehype-sanitize (default schema plus `language-*`
  classes and image `alt`/`width`/`height`). CommonMark only: `remark-gfm` is
  not on the approved list, so tables and task lists are not supported.
- The public page renders the sanitized hast tree straight to React elements
  (`src/lib/markdown.ts`), so no HTML string is ever injected. The only
  `dangerouslySetInnerHTML` is the editor's live preview, fed by
  `/api/admin/posts/render`, which is the same sanitizer.
- Raw HTML in markdown is dropped entirely (not escaped) by remark-rehype.

## Publishing

- `status=published` with an empty date publishes now; the date is kept on
  later edits. `status=scheduled` needs a future time. The repo layer treats a
  scheduled post whose time has passed as visible, so it goes live on the next
  request even if the cron has not run.
- `/api/cron/publish` (GET, `Authorization: Bearer <CRON_SECRET>`) flips due
  posts, writes revision and audit rows, and expires the `posts` cache tag.
  It answers 503 while `CRON_SECRET` is unset.
- **Owner decision:** the Vercel Cron schedule. `vercel.json` was not added
  because a sub-daily schedule fails the deploy on the Hobby plan. Add
  `{"crons":[{"path":"/api/cron/publish","schedule":"0 * * * *"}]}` (or
  `*/10 * * * *` on Pro) once the plan is known, and set `CRON_SECRET` in the
  project environment.
- Revalidation uses `revalidateTag(tag, { expire: 0 })`, the Next 16 form for
  route handlers that expires immediately (the `"max"` profile would serve
  stale content until the next visit; `updateTag` is Server Action only).

## Redirects

- A slug or section change on a post that was ever published writes a 301
  into `redirects` (defaulted on in the editor). Chains and loops are avoided:
  anything pointing at the old path is re-pointed, and a redirect whose source
  is the new path is removed. Restoring an older slug gets the same treatment.
- The table is only written in this phase. Serving redirects from the proxy is
  the SEO phase (§3.6), so the rows have no effect on traffic yet.

## Media

- Uploads go through the route handler, never straight to storage, so the
  bytes are sniffed (magic numbers, the client's MIME type is ignored), SVG is
  refused outright (`svg_rejected`, logged as an `upload_rejected` security
  event), and metadata is stripped before anything is written:
  JPEG APP1/APP3..13/APP15/COM (JFIF, ICC and Adobe segments kept, a minimal
  EXIF orientation tag re-emitted so phone photos stay upright), PNG text and
  eXIf chunks, WebP EXIF/XMP chunks with the VP8X flags cleared, GIF comments
  and non-NETSCAPE application extensions. No `sharp`, so there is no
  resizing or re-encoding.
- Size cap 4 MB (`MAX_UPLOAD_BYTES`): Vercel's request body limit for
  functions is 4.5 MB. Larger originals must be resized before upload.
- Keys are 128-bit random hex plus the sniffed extension. Files are served
  from this origin at `/media/<key>` by `src/app/media/[key]/route.ts` so the
  public CSP `img-src 'self'` stays byte identical. The content type comes
  from the key's extension, which equals the sniffed type.
- Storage backends (`src/lib/storage.ts`): Vercel Blob with **private** access
  when `BLOB_READ_WRITE_TOKEN` is set; local disk `./.data/media` otherwise.
  **The Blob path could not be exercised locally** (no token); the local path
  is what the e2e suite runs. First deploy with a token should upload one
  image and load it on a post before trusting it.
- Replace keeps the key, so the URL is stable; the stored `url` gains
  `?v=<timestamp>` for cache busting. The serving route sends
  `max-age=3600, s-maxage=300`, so a replaced image can stay cached at the
  CDN for up to five minutes and in a browser for an hour.
- Signed short-lived download links (`/api/admin/media/download?id=`): a
  presigned Blob GET in production, an HMAC-signed link on the local backend.
  Library images themselves are public by nature (they appear on public
  pages); private assets with signed delivery arrive with CVs in the jobs
  phase, on the same storage module.
- An image needs alt text before it can be attached as a hero, sharing image
  or picked into a body; the editor's picker lets staff add it in place.
- Delete refuses with 409 `in_use` while any post references the file as
  hero, sharing image, or by URL in its body. Jobs and pages join the usage
  query in their phases.

## Public routes touched

- `/our-blogs/[slug]` and the new `/our-knowledge-base/[slug]` share
  `src/components/PostArticle.tsx`; both are `force-dynamic` because they read
  the locale cookie. The repo layer's `unstable_cache` keeps the database off
  the hot path.
- `/our-knowledge-base` gains a "Guides and articles" section only when at
  least one KB article is published; with none it is byte identical to before
  (asserted in the e2e). Its heading is in `extra.ts` for ar, ur, fr, es.
- `sitemap.xml` lists KB articles and omits posts flagged `noindex`.
- `/admin/posts/[id]/preview` renders the public template inside the public
  chrome for signed-in staff with `content:read`; anonymous requests get a
  plain 404 from the proxy (rewritten, no login redirect, `noindex`).

## Not done, on purpose

- No `vercel.json` cron entry (owner decision above).
- No image resizing or format conversion (no `sharp` on the approved list).
- No GFM tables or task lists in markdown (`remark-gfm` not approved).
- Redirect serving, the redirects UI and the per-route SEO overrides remain
  the SEO phase.
