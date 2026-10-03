# Admin console: migration runbook

Everything needed to take the dashboard from an empty database to a working
Owner login, and to reverse it. Written for the site owner. No prior knowledge
of the dashboard code is assumed.

The public site does not depend on any of this. If you stop after step 1 and
never set the rest, develmo.com keeps serving exactly what it serves today,
from the typed files in `src/lib`. That is deliberate and it is proven by a
test, see **Verify**, step 7.

---

## 0. Before you start

You need:

- The repository, on a machine with Node 20 or newer and `npm`.
- Access to the Vercel project, to set environment variables.
- A Postgres database. Neon is what the code is written for; which provider
  and which account owns it is still yours to decide, see `HANDOFF.md` §11.9.
- About 30 minutes.

Nothing here deploys anything. Deployment is still a push to `main`, done by
you, when you choose.

---

## 1. Provision the database

**Production.** Create a Postgres database with your chosen provider and copy
its connection string. With Neon: create a project, open the dashboard, copy
the **pooled** connection string. It looks like

```
postgres://USER:PASSWORD@ep-something-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

The code picks the Neon serverless driver automatically when the host contains
`neon.tech`, and the standard `pg` driver otherwise. To force the Neon driver
for a host that does not say `neon.tech`, set `DATABASE_DRIVER=neon`.

**Local development.** Any Postgres 15 or newer works:

```bash
createdb develmo
# DATABASE_URL=postgres://postgres@localhost:5432/develmo
```

---

## 2. Set the environment variables

`.env.example` at the repo root lists every variable with a comment saying what
it does and whether it is required. Copy it and fill it in:

```bash
cp .env.example .env.local     # local development
```

For production, set the same names in **Vercel, Project Settings, Environment
Variables**. Never commit a real value; `.gitignore` already excludes
`.env.local`.

The four you cannot skip:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Step 1. |
| `AUTH_SECRET` | `openssl rand -base64 32`. Signs sessions and tokens. Changing it later logs everyone out. |
| `ADMIN_BOOTSTRAP_EMAIL` | The email address of the first Owner. Yours. |
| `ADMIN_BOOTSTRAP_TOKEN` | `openssl rand -hex 16`. A one-time gate on the bootstrap script. Unset it afterwards. |

Strongly recommended before you invite anyone:

| Variable | Why |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | A mailbox to send through, which is the quickest way to working email: the Gmail account with an app password (§10, "Emails are not being delivered", has the five steps). Carries enquiries, access-request notices, invitations, password resets and applicant emails. |
| `RESEND_API_KEY` | Invitations, password resets and email-change confirmations go through Resend when this is set, otherwise through the SMTP mailbox. With neither, the console still creates the invite, but nothing is delivered and the server log says so. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Durable rate limiting across serverless instances. Without them the limiter falls back to a database-backed window, which works but is slower and resets per deployment. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, where uploaded media and applicant CVs live. Without it uploads are written to local disk, which is fine locally and wrong on Vercel. |
| `CRON_SECRET` | Protects `/api/cron/*` and lets the proxy read the IP access rules. At least 16 characters. |

---

## 3. Run the migrations

```bash
npm install
npm run db:migrate
```

This creates every table. It is safe to re-run: Drizzle records which
migrations have been applied and skips those.

Expected output ends with the list of applied migration files and no error. If
it cannot connect, the connection string is wrong or the database is not
reachable from where you are running it.

---

## 4. Seed the content

```bash
npm run db:seed
```

This copies what is already in `src/lib` into the database: the six service
pillars and 21 services, the ten industries, the products, the about
page, the company facts, offices, stats and technologies, and the three blog
posts. It is **idempotent**: running it twice does not create duplicates and does not
overwrite anything you have since edited in the console. Pass `-- --force` to
make it overwrite existing rows with the file contents, which is the way to
throw away console edits and start from the files again.

You can skip this step. The site reads the files whenever the database has no
row, so an unseeded database serves the same pages. Seeding just means the
console has something to show you on day one.

---

## 5. Create the Owner account

```bash
npm run admin:bootstrap -- --token <the ADMIN_BOOTSTRAP_TOKEN you set>
```

The script refuses to run if:

- `ADMIN_BOOTSTRAP_TOKEN` is unset or the token does not match, or
- any user already exists.

That second rule is what stops this becoming a back door: once the console
has an account, this script can never make another. It prints a
one-time sign-in link and a temporary password. Use them once, then:

1. Sign in at `/admin/login`.
2. Set up a second factor: Account, Security, "Set up authenticator", or go
   to `/admin/mfa/enrol`. Scan the QR code with any TOTP app (1Password,
   Authy, Google Authenticator) and enter the six digit code. Whether the
   console *requires* this is a policy at `/admin/security/authentication`:
   optional by default, or required for Owner and Admin, or for everyone.
   Under "optional" nobody is made to, and everyone who has set one up is
   asked for it at each sign in.
3. Save the recovery codes it shows you. They are shown once. Each works once.
4. Change the password at `/admin/account`.
5. Remove `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_TOKEN` from the
   environment.

To add colleagues, use `/admin/users`, "Invite". Invitations expire after 72
hours.

There is no public sign-up route: nobody can create an account for themselves.
There is a public **request** form at `/admin/request-access`, linked from the
sign-in page. It creates a queue entry and nothing else, no account and no
invitation. Requests appear at the bottom of `/admin/users`, where an Owner or
Admin either approves one, which sends exactly the same single-use invitation
the Invite button sends, or declines it, which sends nothing at all.

---

## 6. Point Vercel Cron at the publish route

Scheduled publishing and the recurring maintenance jobs run through
`/api/cron/publish`. In **Vercel, Project Settings, Cron Jobs**, add a job that
calls it every 15 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET`
automatically. While `CRON_SECRET` is unset the route answers 503 rather than
failing quietly, so a misconfiguration is visible rather than silent.

---

## 7. Verify

Run these in order. Each one either passes or tells you what is wrong.

**1. It builds.**

```bash
npm run build
```

Green, with the route table printed at the end. If a `next dev` is running,
use `NEXT_DIST_DIR=.next-build npm run build` instead, or the two fight over
the same directory.

**2. The public site is untouched.**

```bash
npx next start -p 3010 &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/
curl -s http://localhost:3010/robots.txt | grep -i "disallow: /admin"
curl -s http://localhost:3010/sitemap.xml | grep -c "/admin"     # must print 0
```

**3. The console is reachable and gated.**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3010/admin
# 307 -> .../admin/login?next=%2Fadmin
```

**4. Sign in.** Open `/admin/login`, sign in, clear the second factor, and
confirm the dashboard renders.

**5. The tests pass.**

```bash
npm run test:unit
E2E_BASE_URL=http://localhost:3010 npx playwright test
```

**6. An edit reaches the public site.** In the console open
`/admin/content/services`, change a service blurb, save, then load
`/what-we-do/<that slug>` in a browser. The new text is there on the next
request, with no rebuild and no deploy.

**7. The database can fail without taking the site down.** This is the one
that matters most, and it is worth doing once by hand:

```bash
# Point DATABASE_URL at a database that does not exist, then:
npm run build && npx next start -p 3011
curl -s http://localhost:3011/ | grep -c "DevelMo"          # non-zero
curl -s http://localhost:3011/what-we-do | grep -c "Computer Vision"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3011/admin/login
```

The public pages render from the typed files. The console reports that it
cannot reach the database rather than crashing. `tests/unit/repo-util.test.ts`
asserts the same behaviour on every run: the repository layer returns the file
fallback when the query throws and when it hangs past the timeout.

---

## 8. Roll back

Nothing here is one-way. Pick the smallest step that undoes your problem.

**A content edit went wrong.** Blog posts keep revisions: open the post,
"Revisions", pick an earlier one, restore. For services, industries, products
and the about page, delete the row and the typed file takes over again:

```sql
delete from content_entries where entity = 'service' and key = '<slug>';
```

**A translation went wrong.** Clear the override in `/admin/translations`
(save an empty value) and the value from `src/lib/i18n/extra.ts` applies
again on the next request.

**The whole dashboard needs to go away, keeping the site up.** Unset
`DATABASE_URL` in Vercel and redeploy. Every public page falls back to the
typed files. `/admin` will report that it cannot reach the database. Nothing
is lost; the data is still in Postgres.

**Undo the migrations.** There is no down-migration path, by design: a partial
schema is worse than either state. To reset a database completely:

```sql
drop schema public cascade;
create schema public;
```

Then `npm run db:migrate` and `npm run db:seed` to start again. **Take a
backup first**, and do not run this against a database holding real enquiries
or job applications.

**Undo the code.** The dashboard was added in eleven commits on top of
`e0a9992`, "Baseline: develmo-web as received, pre-dashboard". Reverting to
that commit gives you the site exactly as it was before this work started.

---

## 9. Routine operations

| Task | Where |
|---|---|
| Add a user | `/admin/users`, Invite |
| Someone asks for access | `/admin/users`, Access requests. Approve to send them an invitation, choosing the role; decline to close it with no email. A declined person is never told, which is deliberate |
| Remove someone who has left | `/admin/users`, set status to suspended, then revoke their sessions at `/admin/security/sessions` |
| Someone lost their phone | `/admin/users`, reset their second factor. They enrol again at next sign-in |
| Require, allow or switch off the second factor for everyone | `/admin/security/authentication`. Off, optional (the default), required for Owner and Admin, or required for everyone. Owner only; applies to the next sign in at once |
| Decide which console features a role may use | `/admin/security/roles`. A tick box per feature per role. Owner is not listed because it always holds everything, which is what lets a mistake here be undone. Some boxes are fixed: the owner only settings and transferring ownership stay with the Owner, inviting people and changing security or settings stay with Admin, and six rows are held for Admin so nobody can untick their own way out of Users and Security. Ticking an edit also grants the matching view. A change applies on the next page load |
| Open the Hostinger mailboxes | `/admin/users`, "Open Hostinger webmail". The console never holds mailbox credentials; the button is a link to `mail.hostinger.com` |
| Replace the CrowdIQ catalogue | Overwrite `public/crowdiq/develmo-crowdiq-catalog.pdf` and deploy. The "View More Details" button under the use cases on `/our-products/crowdiq` serves that path. PDFs are deliberately outside the year-long immutable cache rule in `next.config.ts`, so a new file is picked up straight away. It is a file in the repo, not content, so it cannot be swapped from the console |
| Add or change an advisory board member | Edit `src/lib/advisory.ts` and deploy. The board is the one piece of public content with no console editor, deliberately: it is two paragraphs about named people, and it changes about once a year. Set `linkedin` to the member profile URL and the page shows the link and adds it as `sameAs` in their Person schema; leave it empty and the link simply does not render, so it cannot ship pointing nowhere. The portrait is a generated monogram, not a file: to use a real headshot, add the image and replace `<Monogram />` in the page |
| Add a product, or change one in the typed file | `npm run content:sync-products` (`-- --dry-run` first). The console edits products but cannot add or delete one, so a product written in `src/lib/products.ts` stays invisible until this runs. It inserts what is missing and fixes the order; a row that differs is left alone unless you add `-- --overwrite`, because it may carry console edits. Then clear the cache at `/admin/performance/cache` |
| Finish retiring OmniRoad on a deployed database | `npm run content:retire-omniroad` (add `-- --dry-run` to look first). The site already hides the product, because `src/lib/repo/products.ts` filters the slug; this deletes the leftover `content_entries` row and rewrites the four About sentences that named it. Safe to run twice |
| Read enquiries | `/admin/submissions` |
| An enquiry did not arrive by email | `/admin/submissions/<id>`, Delivery, Replay. The row was stored before delivery was attempted, so nothing is ever lost |
| Publish a post later | `/admin/posts/<id>`, Publishing, set a date. Vercel Cron publishes it |
| Block an abusive address | `/admin/security/access`. The console refuses to block the address you are connected from without a typed confirmation |
| Change who is told about access requests | `/admin/settings/email`. Defaults to `s.shahzeb8874@gmail.com`, the same inbox the contact form uses |
| Check that email actually arrives | `/admin/settings/email`, Send a test. It reports the channel that carried it, or every failure |
| Check what changed and who did it | `/admin/audit`. Append only, with no delete path anywhere in the code |
| Dependency vulnerabilities | `/admin/security/dependencies`, Scan |

---

## 10. If something goes wrong

**"Cannot reach the database" on every console page.** Check `DATABASE_URL`,
then check the database is awake. Neon suspends idle databases on the free
tier; the first request after a suspend can time out. The public site is
unaffected.

**A console error that starts `revalidating cache with key:` followed by
`Failed query: select ...`.** This is Next itself, not the site's code. A
public page had cached a value from the database; the database then became
unreachable; Next served the cached value and tried to refresh it in the
background, and it logs that failed refresh with `console.error`, which the
development overlay presents as if the page were broken. The page is fine.

Two things soften it. The repository layer keeps the last value the database
gave for each query (`src/lib/repo/util.ts`), so an outage that begins while
the server is up hands that value back with a `[repo] ... kept the last value
the database gave` warning and no error at all. That memory is per process,
so it cannot cover an entry another process wrote: a page prerendered at
build time, or a persisted entry found by a server that started while the
database was already down, which is the usual shape of it locally. For that
case, in development only, `src/instrumentation.ts` turns Next's line into a
warning with the same detail, so the overlay stops presenting a served page
as broken. In production the line stays an error, because an unrefreshable
cache during a database outage is worth alerting on.

Either way the cure is the same as above: make sure the database is
reachable. Locally, the portable Postgres is usually stopped after a reboot;
`npm run db:up` starts it and says whether it did; then reload.

**Invitations and password resets are not arriving.** No email provider is
configured: neither `RESEND_API_KEY` nor the SMTP mailbox. The server log
prints `[email] no provider configured ... not sent -> ...` for every message
it did not send, and the dashboard health strip says "Not configured". The
quickest fix is the Gmail mailbox, next.

**Emails are not being delivered.** Open `/admin/settings/email` and press
"Send a test". It sends a real message to the configured admin address and
tells you exactly which channel carried it, or why every channel refused. The
chain is Resend, then SMTP, then the webhook, then FormSubmit, the same road
the contact form takes. What each one needs:

- **SMTP**, the quickest way to working email: a mailbox you own, sent
  through with its username and a password. For the Gmail account
  `s.shahzeb8874@gmail.com`:
  1. Turn on 2-Step Verification for the Google account at
     https://myaccount.google.com/security if it is not on already. Google
     does not issue app passwords without it.
  2. Open https://myaccount.google.com/apppasswords, type a name such as
     `DevelMo site`, press Create, and copy the 16-letter password Google
     shows once. (If that page says app passwords are not available, the
     account is managed by an organisation or 2-Step Verification is off.)
  3. Put it in `.env.local` as `SMTP_PASS=`. The other four lines are
     already there: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
     `SMTP_USER=s.shahzeb8874@gmail.com` and `SMTP_FROM`. Spaces in the
     pasted password do no harm.
  4. Run `npm run email:test`. It logs in, sends one message to the inbox and
     says exactly what went wrong otherwise. Then restart `npm run dev`; the
     dashboard health strip now says "SMTP login accepted".
  5. For the live site, add the same five variables in Vercel under the
     project's Settings, Environment Variables, and redeploy.

  Gmail sends as the account itself whatever `SMTP_FROM` says, and allows a
  few hundred messages a day, which is plenty for enquiries, notices and
  invitations. If the app password ever leaks, revoke it on the same Google
  page and create another; nothing else changes.
- **Resend**: `RESEND_API_KEY` set, and `CONTACT_FROM` on a domain you have
  verified in Resend. The default sender `onboarding@resend.dev` only delivers
  to the email address that owns the Resend account, which is fine for a test
  and useless for anyone else. Verifying develmo.com means adding Resend's
  DKIM and SPF records at Hostinger, which touches the mail DNS that
  `HANDOFF.md` Appendix B says must stay untouched: that is your call, not
  something a contributor should do.
- **Webhook**: `CONTACT_WEBHOOK_URL`, for your own automation.
- **FormSubmit**: needs no key, but each recipient address must have clicked
  the activation email FormSubmit sends the first time it is used. The
  activation for `s.shahzeb8874@gmail.com` was still pending when the site was
  handed over; the first real message triggers it.

Invitations to new people go through Resend or SMTP, never FormSubmit, which
can only reach addresses that have activated it. Until one of those is set,
approving a request still creates the invitation and shows you the link to
pass on by hand. Mail to the reserved test domains (`example.com`,
`.invalid`, `.test`) is never sent by any channel, so the automated tests
cannot fill the inbox with bounces; with the mailbox configured, the
durability tests deliver a handful of real messages to it instead of
recording a failure.

**The second factor refuses a right code.** The prompt says why: a code for a
device clock that is minutes out ("about 4 minutes ahead"), a code already
used in the same half minute, or a recovery code from an earlier set-up. A
fast or slow clock: set the phone's date and time to automatic. Two "DevelMo
Admin" entries in the authenticator app: only the newest works, delete the
other. Recovery codes: only the set shown at the most recent set-up works,
each once. Five refusals in ten minutes lock the prompt for the rest of those
ten minutes. The reason is also recorded on each `mfa_failed` row at
`/admin/security/events`.

**Locked out of the Owner account.** If you still have a recovery code, use it
at the second factor prompt. If another Owner can sign in, they can switch
the policy to "off" at `/admin/security/authentication`, which lets you in on
the password alone until you set the authenticator up again. If not, clear
the second factor directly:

```sql
update users set totp_enabled = false, totp_secret_enc = null where email = '<you>';
```

Then sign in and enrol again. This is why **Who holds the Owner account**, in
the decisions list, is worth settling before you need the answer.

**A deploy made the site worse.** Revert the commit and push. Content and
translations live in the database, so a code revert does not lose them.

---

## 11. Day to day on your machine

The one thing that keeps going wrong locally is the database being off when
the site starts. The portable Postgres runs as an ordinary program attached
to whichever terminal started it, so it stops with a reboot, with Ctrl+C in
that terminal, or when that terminal window is closed. `npm run dev` now
starts it first, every time, so the routine is short.

**First time only.**

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL and AUTH_SECRET at least
npm run db:up                   # starts Postgres and proves it answers
npm run db:migrate              # creates the tables
npm run db:seed                 # optional, copies the file content into the database
```

**Every day.**

```bash
npm run dev
```

That runs `db:up` first (you will see `[ok] postgres started ...` or
`[ok] postgres is already running ...`) and then the site. Then:

- Public site: <http://localhost:3000>
- Admin console: <http://localhost:3000/admin/login>, or the "Admin" link in
  the footer of any page.

An account that has set up a second factor is asked for it after the
password, so have your authenticator app to hand. Nobody is made to set one
up unless the policy at `/admin/security/authentication` says so (it is
"optional" until you change it).

**If the console says "The database is not reachable right now".** Postgres
has stopped since the site started, usually because the terminal that started
it was closed. In any terminal, in the project folder:

```bash
npm run db:up
```

Reload the page. Nothing else needs restarting; the site reconnects on the
next request.

`db:up` also clears the one state that looks like "up" but is not: the
server died mid-recovery and a leftover child process is still holding the
port, so nothing answers and `pg_ctl stop` finds nothing to stop. It names
the leftover processes, ends them, and starts the server properly.

**Never think about it again.** Registering the server as a Windows service
makes it start with the machine and ignore terminals entirely. Once, from a
PowerShell window opened with "Run as administrator":

```powershell
D:\Work\Develmo\devtools\pgsql\bin\pg_ctl.exe register -N develmo-postgres -D D:\Work\Develmo\devtools\pgdata -o "-p 54329" -S auto
net start develmo-postgres
```

After that `npm run db:up` simply reports that it is already running. To
undo: `net stop develmo-postgres` and `pg_ctl.exe unregister -N develmo-postgres`.
