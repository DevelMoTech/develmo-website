# Deploying develmo-build.zip to Hostinger

`develmo-build.zip` is a self-contained Node application. Rebuild it any time with:

```
npm run build:selfhost      # writes ./deploy
```

then zip the **contents** of `./deploy`, not the folder itself, so `server.js` lands at the top level.

---

## 1. What kind of Hostinger plan this needs

**A VPS or Cloud plan, with Node 20.9 or newer.** It will not run on static or shared hosting
without a Node runtime. Every page is rendered by a server: the admin console, the contact form,
the language switcher and all the content from your database. There is no static export that keeps
any of that working.

## 2. Upload and start

1. Upload `develmo-build.zip` into the application directory and extract it there.
   `server.js`, `package.json`, `.next`, `public` and `node_modules` must sit at the top level.
2. Do **not** run `npm install`. The bundle already holds the exact packages it needs, trimmed to
   what the app actually reaches. Installing would undo that.
3. Start it:
   ```
   node server.js
   ```
   It listens on `$PORT` (3000 if unset) and `$HOSTNAME` (set `0.0.0.0` behind a reverse proxy).
4. Keep it running with the panel's Node app manager, or `pm2 start server.js --name develmo`.

## 3. Environment variables, set on the host

Secrets are deliberately not in the zip. Set them in the Hostinger panel.

| Variable | Why |
|---|---|
| `DATABASE_URL` | Postgres. Content, submissions, users and sessions all read it. Required |
| `AUTH_SECRET` | Signs admin session cookies. Required |
| `NEXT_PUBLIC_SITE_URL` | `https://develmo.com`. Canonicals, sitemap, OG tags. Required |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Contact form and console email |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Contact form spam check. See the warning below |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Durable rate limiting. Without them a database window is used |
| `BLOB_READ_WRITE_TOKEN` | Leave unset on a VPS. See uploads below |

## 4. Three things to get right

**reCAPTCHA will silently reject every contact submission on an unregistered host.** The key is
registered for `develmo.com`, `www.develmo.com` and `localhost` only. If you test on a temporary
Hostinger URL or an IP address, every submission fails with `reCAPTCHA rejected (browser-error)`
and the visitor sees nothing happen. Add that host in the Google reCAPTCHA admin console first,
or leave the two keys unset while testing.

**Scheduled posts need a real cron job.** Vercel Cron used to call `/api/cron/publish`. Nothing
calls it here. Add a cron entry hitting that route, or posts with a future publish date never go
live.

**Uploads are written to disk, next to the server.** With `BLOB_READ_WRITE_TOKEN` unset, console
media and job applicants' CVs go to `./.data/`. That is correct on a VPS, where the disk persists,
but it means two things: back `./.data` up, and **do not delete or overwrite it when you deploy a
new build**. Extract updates over the top, or keep `.data` outside the application directory.

## 5. Checking it worked

```
curl -I https://your-host/                      # 200, with the security headers
curl -s https://your-host/our-products | head   # four products, from the database
curl -I https://your-host/admin/login           # 200
```

Then submit the contact form once and confirm the enquiry appears in `/admin/submissions`.
The row is written before delivery is attempted, so if it is there but no email arrived, the
problem is SMTP, not the form.

## 6. The DNS cutover

`develmo.com` currently points at Vercel, and Hostinger holds the DNS. Nothing above changes that.
Point the A record at the Hostinger server only once the checks in section 5 pass against the
server's own address, so the live site is never serving a half-configured build.
