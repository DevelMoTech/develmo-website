import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";
import { posts as filePosts } from "../src/lib/posts";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "editor" | "viewer" | "owner" = "editor") {
  const email = uniqueEmail(`posts-${role}`);
  await createUser({ email, password: PASSWORD, role, name: `E2E ${role}` });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf, request: context.request };
}

function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: Record<string, unknown>) {
  return request.post(`${baseURL}${path}`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data });
}

// A valid 2x2 PNG built in-test, plus a tEXt chunk so the strip is observable.
function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array([...Buffer.from(type, "latin1"), ...data]);
  const len = data.length;
  const crc = crc32(body);
  return new Uint8Array([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body, (crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]);
}
function pngBytes(): Buffer {
  const ihdr = new Uint8Array([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
  const raw = new Uint8Array(2 * (1 + 2 * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", new Uint8Array(Buffer.from("Comment\0e2e camera metadata", "latin1"))),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

async function upload(request: APIRequestContext, baseURL: string, csrf: string, file: { name: string; mimeType: string; buffer: Buffer }, extra: Record<string, string> = {}) {
  const res = await request.post(`${baseURL}/api/admin/media/upload`, {
    headers: { "x-csrf-token": csrf, origin: baseURL },
    multipart: { file, ...extra },
  });
  return { status: res.status(), body: (await res.json()) as { ok: boolean; error?: string; media?: { id: string; url: string; altText: string; size: number } } };
}

test.afterAll(async () => {
  // Scoped to this worker's run: a retried serial group starts a new worker,
  // and the old worker's teardown must not delete the new worker's rows.
  await db().query(`delete from posts where slug like $1`, [`e2e-${RUN}-%`]);
  await db().query(`delete from media where filename like 'e2e-%'`);
  await db().query(`delete from redirects where source like $1`, [`%/e2e-${RUN}-%`]);
  await cleanup();
});

test("create and publish a post in the editor, confirm it on the public site with correct head, OG and JSON-LD, then unpublish", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, page, request } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  const title = `E2E ${RUN} Edge inference for retail`;
  const slug = `e2e-${RUN}-edge-inference-for-retail`;

  await page.goto("/admin/posts/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New post");
  await page.getByLabel("Title", { exact: true }).fill(title);
  // Slug follows the title and the live check confirms it is free.
  await expect(page.getByLabel("Slug", { exact: true })).toHaveValue(slug);
  await expect(page.locator("#p-slug-status")).toContainText(`Available: /our-blogs/${slug}`);
  await page.getByLabel("Excerpt", { exact: true }).fill("Why running detection on the camera beats streaming everything to the cloud.");
  await page.getByLabel("Body (markdown)").fill("## Why the edge\n\nLatency and bandwidth both improve.\n\n- Cheaper\n- Faster\n\n<script>alert(1)</script>\n\nDone.");
  await page.getByLabel("Category", { exact: true }).fill("Computer Vision");
  await page.getByLabel("Tags", { exact: true }).fill("Edge, cameras");
  await page.getByLabel("Meta description").fill("A short, hand-written meta description for the e2e post.");
  // Live preview renders through the sanitizer.
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator(".adm-md-preview h2")).toHaveText("Why the edge");
  expect(await page.locator(".adm-md-preview script").count()).toBe(0);
  await page.getByRole("tab", { name: "Write" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("published");
  await page.getByRole("button", { name: "Create post" }).click();
  await page.waitForURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

  // Public page, straight after publishing (the tag was expired, not just marked stale).
  const res = await request.get(`${baseURL}/our-blogs/${slug}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(`<title>${title} | DevelMo</title>`);
  expect(html).toContain('<meta name="description" content="A short, hand-written meta description for the e2e post."/>');
  expect(html).toContain(`<meta property="og:title" content="${title} | DevelMo"/>`);
  expect(html).toContain('<meta property="og:type" content="article"/>');
  expect(html).toContain(`<meta property="og:url" content="https://develmo.com/our-blogs/${slug}"/>`);
  expect(html).toContain('<meta property="og:image" content="https://develmo.com/og.jpg?v=2"/>');
  expect(html).toContain(`<link rel="canonical" href="https://develmo.com/our-blogs/${slug}"/>`);
  expect(html).toContain('<meta name="robots" content="index, follow"/>');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"Article".*?)<\/script>/)![1]);
  expect(ld.headline).toBe(title);
  expect(ld.mainEntityOfPage).toBe(`https://develmo.com/our-blogs/${slug}`);
  expect(html).toContain("<h2>Why the edge</h2>");
  expect(html).toContain("<ul><li>Cheaper</li><li>Faster</li></ul>");
  expect(html).not.toContain("alert(1)");
  // Listed on the blog index and in the sitemap.
  expect(await request.get(`${baseURL}/our-blogs`).then((r) => r.text())).toContain(`/our-blogs/${slug}`);
  expect(await request.get(`${baseURL}/sitemap.xml`).then((r) => r.text())).toContain(`https://develmo.com/our-blogs/${slug}`);

  // Revision and audit rows exist.
  const revs = await db().query<{ n: string }>(`select count(*)::text as n from post_revisions where post_id = $1`, [id]);
  expect(Number(revs.rows[0].n)).toBe(1);
  const audit = await db().query<{ action: string }>(`select action from audit_log where entity_type = 'post' and entity_id = $1`, [id]);
  expect(audit.rows.map((r) => r.action)).toContain("post.publish");

  // Unpublish from the editor: the public route 404s at once. The publish
  // date is filled in by the client, so a value there means the editor has
  // hydrated and the select change will reach React state.
  await expect(page.getByLabel("Publish date")).not.toHaveValue("");
  await page.getByLabel("Status", { exact: true }).selectOption("draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect((await request.get(`${baseURL}/our-blogs/${slug}`)).status()).toBe(404);
  expect(await request.get(`${baseURL}/our-blogs`).then((r) => r.text())).not.toContain(`/our-blogs/${slug}`);

  // Draft preview: 404 with no session, the real template with one.
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${baseURL}/admin/posts/${id}/preview`);
  expect(anonRes.status()).toBe(404);
  expect(anonRes.url()).not.toContain("/admin/login");
  await anon.close();
  const previewRes = await request.get(`${baseURL}/admin/posts/${id}/preview`);
  expect(previewRes.status()).toBe(200);
  const preview = await previewRes.text();
  expect(preview).toContain("<h2>Why the edge</h2>");
  expect(preview).toContain(`<h1>${title}</h1>`);
  expect(preview).toContain("Not public.");
  expect(previewRes.headers()["x-robots-tag"]).toContain("noindex");
  await context.close();
});

test("the three seeded posts render identically to the typed file data", async ({ request, baseURL }) => {
  for (const p of filePosts) {
    const res = await request.get(`${baseURL}/our-blogs/${p.slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
    // The article is exactly one <p> per paragraph, as it was before markdown.
    const article = html.match(/<article class="prose"[^>]*>([\s\S]*?)<\/article>/)![1];
    expect(article).toBe(p.body.map((para) => `<p>${esc(para)}</p>`).join(""));
    expect(html).toContain(`<h1>${esc(p.title)}</h1>`);
    expect(html).toContain(`<title>${esc(p.title)} | DevelMo</title>`);
    expect(html).toContain(`<meta name="description" content="${esc(p.excerpt)}"/>`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"Article".*?)<\/script>/)![1]);
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: p.excerpt,
      datePublished: p.date,
      author: { "@type": "Organization", name: "DevelMo" },
      publisher: { "@type": "Organization", name: "DevelMo" },
      mainEntityOfPage: `https://develmo.com/our-blogs/${p.slug}`,
    });
  }
});

test("media: SVG is rejected, a PNG is accepted with metadata stripped, alt text gates attachment, delete refuses while in use", async ({ browser, baseURL }) => {
  const { context, request, csrf, email } = await signedIn(browser, baseURL!);

  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const rejected = await upload(request, baseURL!, csrf, { name: "e2e-logo.svg", mimeType: "image/svg+xml", buffer: svg });
  expect(rejected.status).toBe(415);
  expect(rejected.body.error).toBe("svg_rejected");
  // A renamed SVG claiming to be a PNG is still an SVG to the sniffer.
  const disguised = await upload(request, baseURL!, csrf, { name: "e2e-logo.png", mimeType: "image/png", buffer: svg });
  expect(disguised.status).toBe(415);
  expect(disguised.body.error).toBe("svg_rejected");
  const events = await db().query<{ n: string }>(`select count(*)::text as n from security_events where type = 'upload_rejected' and email = $1`, [email]);
  expect(Number(events.rows[0].n)).toBe(2);
  const text = await upload(request, baseURL!, csrf, { name: "e2e-notes.png", mimeType: "image/png", buffer: Buffer.from("just text") });
  expect(text.status).toBe(415);
  expect(text.body.error).toBe("unsupported_type");

  const png = pngBytes();
  const ok = await upload(request, baseURL!, csrf, { name: "e2e-camera.png", mimeType: "application/octet-stream", buffer: png }, { folder: "e2e/uploads" });
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  const media = ok.body.media!;
  expect(media.url).toMatch(/^\/media\/[a-f0-9]{32}\.png$/);
  // Stripped: smaller than what was sent, and the served bytes carry no tEXt.
  expect(media.size).toBeLessThan(png.length);
  const served = await request.get(`${baseURL}${media.url}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  const body = await served.body();
  expect(body.length).toBe(media.size);
  expect(body.toString("latin1")).not.toContain("e2e camera metadata");
  expect(body.toString("latin1")).toContain("IDAT");
  const row = await db().query<{ width: number; height: number; content_type: string; folder: string }>(`select width, height, content_type, folder from media where id = $1`, [media.id]);
  expect(row.rows[0]).toEqual({ width: 2, height: 2, content_type: "image/png", folder: "e2e/uploads" });

  // No alt text: cannot be attached.
  const slug = `e2e-${RUN}-with-hero`;
  const noAlt = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: `E2E ${RUN} hero`, slug, status: "draft", heroImageId: media.id });
  expect(noAlt.status()).toBe(400);
  expect((await noAlt.json()).error).toBe("media_alt");
  const setAlt = await post(request, baseURL!, csrf, "/api/admin/media/update", { id: media.id, altText: "A shop-floor camera", folder: "e2e/uploads", tags: ["e2e"], filename: "e2e-camera.png" });
  expect(setAlt.status()).toBe(200);
  const created = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: `E2E ${RUN} hero`, slug, status: "published", heroImageId: media.id, bodyMd: `Body with an inline image.\n\n![Inline](${media.url})` });
  expect(created.status()).toBe(200);
  const postId = (await created.json()).id as string;

  // The hero renders on the public page with its alt text, and JSON-LD gains an image.
  const html = await request.get(`${baseURL}/our-blogs/${slug}`).then((r) => r.text());
  expect(html).toContain(`<img src="${media.url}" alt="A shop-floor camera" width="2" height="2"`);
  expect(html).toContain(`"image":"https://develmo.com${media.url}"`);
  expect(html).toContain(`<meta property="og:image" content="https://develmo.com${media.url}"/>`);

  // In use twice (hero and body): delete refuses.
  const del = await post(request, baseURL!, csrf, "/api/admin/media/delete", { id: media.id });
  expect(del.status()).toBe(409);
  const delBody = await del.json();
  expect(delBody.error).toBe("in_use");
  expect(delBody.usage.map((u: { via: string }) => u.via).sort()).toEqual(["body", "hero"]);

  // The picker offers only alt-texted images.
  const list = await request.get(`${baseURL}/api/admin/media/list?withAlt=1&q=e2e-camera`).then((r) => r.json());
  expect(list.items.map((i: { id: string }) => i.id)).toContain(media.id);

  // Detach and delete for real: the object is gone from storage too.
  await post(request, baseURL!, csrf, "/api/admin/posts/delete", { id: postId });
  const del2 = await post(request, baseURL!, csrf, "/api/admin/media/delete", { id: media.id });
  expect(del2.status()).toBe(200);
  expect((await request.get(`${baseURL}${media.url}`)).status()).toBe(404);
  await context.close();
});

test("slug change writes a 301 into the redirects table; revisions diff and restore; scheduled publishing via the cron route", async ({ browser, baseURL }) => {
  const { context, page, request, csrf } = await signedIn(browser, baseURL!);
  const oldSlug = `e2e-${RUN}-old-address`;
  const newSlug = `e2e-${RUN}-new-address`;
  const created = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: `E2E ${RUN} moving`, slug: oldSlug, status: "published", bodyMd: "First version." });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id as string;

  // Slug taken check.
  const taken = await request.get(`${baseURL}/api/admin/posts/slug-check?type=blog&slug=${oldSlug}`).then((r) => r.json());
  expect(taken.available).toBe(false);
  expect(taken.suggestion).toBe(`${oldSlug}-2`);
  const dup = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: "dup", slug: oldSlug, status: "draft" });
  expect(dup.status()).toBe(409);

  // Change the slug with the redirect defaulted on.
  const updated = await post(request, baseURL!, csrf, "/api/admin/posts/update", { id, type: "blog", title: `E2E ${RUN} moving`, slug: newSlug, status: "published", bodyMd: "Second version.\n\nWith another paragraph." });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).redirectCreated).toBe(true);
  const redirect = await db().query<{ destination: string; code: number; enabled: boolean }>(`select destination, code, enabled from redirects where source = $1`, [`/our-blogs/${oldSlug}`]);
  expect(redirect.rows[0]).toEqual({ destination: `/our-blogs/${newSlug}`, code: 301, enabled: true });
  expect((await request.get(`${baseURL}/our-blogs/${newSlug}`)).status()).toBe(200);
  // Phase 7 made these rows live: the proxy serves the 301 from a map it
  // refreshes on a short TTL, so poll until it takes hold rather than
  // asserting the old 404, which was only true while the rows were unserved.
  const oldUrl = `${baseURL}/our-blogs/${oldSlug}`;
  let moved = await request.get(oldUrl, { maxRedirects: 0 });
  for (let i = 0; i < 40 && moved.status() !== 301; i++) {
    await new Promise((r) => setTimeout(r, 500));
    moved = await request.get(oldUrl, { maxRedirects: 0 });
  }
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toContain(`/our-blogs/${newSlug}`);

  // Revisions: two saves, a diff, a restore that writes a third.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/posts/${id}/revisions`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revisions");
  await expect(page.locator(".adm-revisions tbody tr")).toHaveCount(2);
  const bodyDiff = page.locator('section[aria-label="Body"]');
  await expect(bodyDiff.locator("del").first()).toContainText("First version.");
  await expect(bodyDiff.locator("ins").first()).toContainText("Second version.");
  await expect(page.locator('section[aria-label="Slug"] ins')).toContainText(newSlug);
  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.getByRole("button", { name: "Restore", exact: true }).last().click();
  await page.waitForURL(`**/admin/posts/${id}`);
  await expect(page.getByLabel("Body (markdown)")).toHaveValue("First version.");
  const revs = await db().query<{ note: string }>(`select note from post_revisions where post_id = $1 order by created_at`, [id]);
  expect(revs.rows.map((r) => r.note)).toEqual(["Created", "Saved", expect.stringMatching(/^Restored revision from /)]);
  // The restored slug was free, so it came back with its own redirect, and
  // the stale old-to-new redirect (which would now send the live URL away) is gone.
  const back = await db().query<{ destination: string }>(`select destination from redirects where source = $1`, [`/our-blogs/${newSlug}`]);
  expect(back.rows[0]?.destination).toBe(`/our-blogs/${oldSlug}`);
  const stale = await db().query(`select 1 from redirects where source = $1`, [`/our-blogs/${oldSlug}`]);
  expect(stale.rowCount).toBe(0);
  // The proxy holds the previous map for up to its refresh window, so the
  // deleted rule can still send this URL away for a moment.
  let liveAgain = await request.get(`${baseURL}/our-blogs/${oldSlug}`);
  for (let i = 0; i < 40 && liveAgain.status() !== 200; i++) {
    await new Promise((r) => setTimeout(r, 500));
    liveAgain = await request.get(`${baseURL}/our-blogs/${oldSlug}`);
  }
  expect(liveAgain.status()).toBe(200);

  // Scheduled publishing: a due scheduled post is not yet "published" in the
  // table but already visible; the cron flips it and records who did it.
  const schedSlug = `e2e-${RUN}-scheduled`;
  await db().query(`insert into posts (type, slug, title, status, published_at) values ('blog', $1, 'E2E scheduled', 'scheduled', now() - interval '1 minute')`, [schedSlug]);
  const noSecret = await request.get(`${baseURL}/api/cron/publish`);
  expect(noSecret.status()).toBe(401);
  const wrong = await request.get(`${baseURL}/api/cron/publish`, { headers: { authorization: "Bearer nope-nope-nope-nope" } });
  expect(wrong.status()).toBe(401);
  const cron = await request.get(`${baseURL}/api/cron/publish`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).published).toContain(schedSlug);
  const flipped = await db().query<{ status: string }>(`select status from posts where slug = $1`, [schedSlug]);
  expect(flipped.rows[0].status).toBe("published");
  expect((await request.get(`${baseURL}/our-blogs/${schedSlug}`)).status()).toBe(200);
  await context.close();
});

test("knowledge base articles share the model and render at /our-knowledge-base/<slug>; the list page is untouched without them", async ({ browser, baseURL }) => {
  const { context, request, csrf } = await signedIn(browser, baseURL!);
  const before = await request.get(`${baseURL}/our-knowledge-base`).then((r) => r.text());
  expect(before).not.toContain("Guides and articles");
  const slug = `e2e-${RUN}-kb-guide`;
  const created = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "kb", title: `E2E ${RUN} KB guide`, slug, status: "published", excerpt: "A guide.", bodyMd: "Guide body.", translations: { fr: { title: "Guide E2E", bodyMd: "Corps du guide." } } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id as string;
  const page = await request.get(`${baseURL}/our-knowledge-base/${slug}`);
  expect(page.status()).toBe(200);
  expect(await page.text()).toContain("<p>Guide body.</p>");
  const list = await request.get(`${baseURL}/our-knowledge-base`).then((r) => r.text());
  expect(list).toContain("Guides and articles");
  expect(list).toContain(`/our-knowledge-base/${slug}`);
  // Same slug is free in the other section (uniqueness is per type).
  expect((await request.get(`${baseURL}/api/admin/posts/slug-check?type=blog&slug=${slug}`).then((r) => r.json())).available).toBe(true);
  // French visitors get the translated fields from the database.
  const fr = await request.get(`${baseURL}/our-knowledge-base/${slug}`, { headers: { cookie: "locale=fr" } }).then((r) => r.text());
  expect(fr).toContain("<h1>Guide E2E</h1>");
  expect(fr).toContain("<p>Corps du guide.</p>");
  // Bulk delete puts the list page back exactly as it was.
  const bulk = await post(request, baseURL!, csrf, "/api/admin/posts/bulk", { ids: [id], action: "delete" });
  expect(bulk.status()).toBe(200);
  const after = await request.get(`${baseURL}/our-knowledge-base`).then((r) => r.text());
  const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, "");
  expect(strip(after)).toBe(strip(before));
  await context.close();
});

test("bulk actions from the posts list, and a viewer cannot write", async ({ browser, baseURL }) => {
  const { context, page, request, csrf } = await signedIn(browser, baseURL!);
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const res = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: `E2E ${RUN} bulk ${n}`, slug: `e2e-${RUN}-bulk-${n}`, status: "draft", tags: ["old"] });
    ids.push((await res.json()).id);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/posts?q=e2e-${RUN}-bulk`);
  await expect(page.locator(".adm-rowcheck")).toHaveCount(2);
  await page.getByLabel("Select all posts on this page").check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Retag" }).click();
  await page.getByLabel("Add tags").fill("fresh");
  await page.getByLabel("Remove tags").fill("old");
  await page.getByRole("button", { name: "Apply", exact: true }).last().click();
  await expect(page.getByText("2 posts retagged")).toBeVisible();
  await page.getByLabel("Select all posts on this page").check();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("2 posts published")).toBeVisible();
  const rows = await db().query<{ status: string; tags: string[] }>(`select status, tags from posts where id = any($1)`, [ids]);
  expect(rows.rows.every((r) => r.status === "published" && r.tags.join() === "fresh")).toBe(true);
  expect((await request.get(`${baseURL}/our-blogs/e2e-${RUN}-bulk-1`)).status()).toBe(200);
  await page.getByLabel("Select all posts on this page").check();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("2 posts archived")).toBeVisible();
  expect((await request.get(`${baseURL}/our-blogs/e2e-${RUN}-bulk-1`)).status()).toBe(404);
  await context.close();

  const viewer = await signedIn(browser, baseURL!, "viewer");
  const denied = await post(viewer.request, baseURL!, viewer.csrf, "/api/admin/posts/create", { type: "blog", title: "nope", slug: `e2e-${RUN}-viewer`, status: "draft" });
  expect(denied.status()).toBe(403);
  await viewer.page.goto("/admin/posts");
  await expect(viewer.page.getByRole("heading", { level: 1 })).toHaveText("Posts");
  await expect(viewer.page.getByRole("link", { name: "New post" })).toHaveCount(0);
  await viewer.page.goto("/admin/posts/new");
  await viewer.page.waitForURL(/\/admin\?denied=/);
  await viewer.context.close();
});

test("media library UI: upload from the page, edit details, pick as a hero in the editor, replace, signed download, delete guard", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, page, request } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Media");
  const png = pngBytes();
  await page.getByLabel("Choose images to upload").setInputFiles([
    { name: "e2e-ui-photo.png", mimeType: "image/png", buffer: png },
    { name: "e2e-ui-vector.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
  ]);
  await expect(page.getByText("1 file uploaded")).toBeVisible();
  await expect(page.locator(".adm-upload-error")).toContainText("SVG files are not accepted");

  // Open the details, fill in alt text, folder and tags.
  await page.getByRole("button", { name: "Open e2e-ui-photo.png" }).click();
  const dialog = page.locator("#media-details");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Alt text").fill("A photo used by the UI test");
  await dialog.getByLabel("Folder").fill("e2e/ui");
  await dialog.getByLabel("Tags").fill("ui, e2e");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved")).toBeVisible();
  await expect
    .poll(async () => (await db().query<{ folder: string; tags: string[]; alt_text: string }>("select folder, tags, alt_text from media where filename = $1", ["e2e-ui-photo.png"])).rows[0])
    .toEqual({ folder: "e2e/ui", tags: ["ui", "e2e"], alt_text: "A photo used by the UI test" });

  // Replace keeps the address (a version query is added for caches).
  const before = (await db().query<{ id: string; url: string; blob_key: string }>("select id, url, blob_key from media where filename = $1", ["e2e-ui-photo.png"])).rows[0];
  await dialog.getByLabel("Choose a replacement file").setInputFiles({ name: "e2e-ui-photo-v2.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("File replaced")).toBeVisible();
  await expect.poll(async () => (await db().query<{ url: string }>("select url from media where id = $1", [before.id])).rows[0].url).toMatch(new RegExp(`^/media/${before.blob_key}\\?v=\\d+$`));

  // Signed download link: works with the right signature, 404 otherwise.
  const dl = (await request.get(`${baseURL}/api/admin/media/download?id=${before.id}`).then((r) => r.json())) as { url: string };
  expect(dl.url).toMatch(/download=1&exp=\d+&sig=[a-f0-9]{64}/);
  expect((await request.get(`${baseURL}${dl.url}`)).headers()["content-disposition"]).toContain("attachment");
  expect((await request.get(`${baseURL}${dl.url.replace(/sig=[a-f0-9]{64}/, `sig=${"0".repeat(64)}`)}`)).status()).toBe(404);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toBeHidden();

  // Editor: pick it as the hero through the picker, save, and see it on the page.
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill(`E2E ${RUN} picker`);
  await page.getByRole("button", { name: "Choose image" }).last().click();
  const picker = page.locator("#media-picker");
  await picker.getByLabel("Search file name or alt text").fill("e2e-ui-photo");
  await picker.getByRole("button", { name: "Use this image" }).first().click();
  await expect(page.locator(".adm-image-field")).toContainText("e2e-ui-photo.png");
  await page.getByLabel("Status", { exact: true }).selectOption("published");
  await page.getByRole("button", { name: "Create post" }).click();
  await page.waitForURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
  const html = await request.get(`${baseURL}/our-blogs/e2e-${RUN}-picker`).then((r) => r.text());
  expect(html).toContain('alt="A photo used by the UI test"');

  // In use: the details view shows where, and delete is disabled.
  await page.goto("/admin/media?view=list");
  await page.getByRole("button", { name: "e2e-ui-photo.png" }).click();
  await expect(page.locator("#media-details")).toContainText("hero image");
  await expect(page.locator("#media-details").getByRole("button", { name: "Delete" })).toBeDisabled();
  await context.close();
});

test("editor pages have no horizontal overflow at 360, 768 and 1280", async ({ browser, baseURL }) => {
  const { context, page, request, csrf } = await signedIn(browser, baseURL!);
  const res = await post(request, baseURL!, csrf, "/api/admin/posts/create", { type: "blog", title: `E2E ${RUN} layout`, slug: `e2e-${RUN}-layout`, status: "draft", bodyMd: "A body." });
  const id = (await res.json()).id as string;
  const lines: string[] = [];
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [`/admin/posts/${id}`, `/admin/posts/${id}/revisions`, "/admin/media", "/admin/posts"]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });
      const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      lines.push(`${width}px ${path.replace(id, "<id>")}: scrollWidth=${scroll} clientWidth=${client}`);
      expect(scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(client);
      expect(await page.locator("h1").count()).toBe(1);
    }
  }
  console.log(lines.join("\n"));
  await context.close();
});

// The editor's formatting toolbar and the picker's upload tab. Hero, sharing
// image and insert image all open the same picker, so each is exercised
// through the upload route, and the body gets formatted through the toolbar
// and the keyboard.
test("editor: format the body from the toolbar and the keyboard, and upload images from the computer for the hero, the sharing image and the body", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill(`E2E ${RUN} toolbar`);

  // Toolbar: select the words and press Bold; then Ctrl+I on the selection
  // the toolbar restored; then Heading on the line.
  const body = page.locator("#p-body");
  await body.fill("make this bold");
  await body.press("Control+a");
  await page.getByRole("button", { name: "Bold (Ctrl+B)" }).click();
  await expect(body).toHaveValue("**make this bold**");
  await body.press("Control+i");
  await expect(body).toHaveValue("***make this bold***");
  await page.getByRole("button", { name: "Heading" }).click();
  await expect(body).toHaveValue("## ***make this bold***");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await expect(body).toHaveValue("- ## ***make this bold***");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await expect(body).toHaveValue("## ***make this bold***");
  console.log("EDITOR: bold from the toolbar, italic from Ctrl+I, heading and list toggled on the same line");

  const png = pngBytes();
  const picker = page.locator("#media-picker");
  async function uploadThroughPicker(name: string, alt: string) {
    await picker.getByRole("tab", { name: "Upload from this computer" }).click();
    await picker.getByLabel("Choose an image to upload").setInputFiles({ name, mimeType: "image/png", buffer: png });
    await picker.getByLabel("Alt text (required)").fill(alt);
    await picker.getByRole("button", { name: "Upload and use this image" }).click();
    await expect(picker).toBeHidden();
  }

  // Body: insert image opens the picker; the upload lands at the cursor.
  await body.press("End");
  await page.getByRole("button", { name: "Insert image" }).click();
  await uploadThroughPicker(`e2e-${RUN}-body.png`, "E2E body image");
  await expect(body).toHaveValue(/## \*\*\*make this bold\*\*\*\n\n!\[E2E body image\]\(\/media\/[^)]+\)\n\n$/);

  // Hero: the last "Choose image" button on the page belongs to the hero field.
  await page.getByRole("button", { name: "Choose image" }).last().click();
  await uploadThroughPicker(`e2e-${RUN}-hero.png`, "E2E hero image");
  await expect(page.locator(".adm-image-field").last()).toContainText(`e2e-${RUN}-hero.png`);

  // Sharing image: the first "Choose image" button belongs to it.
  await page.getByRole("button", { name: "Choose image" }).first().click();
  await uploadThroughPicker(`e2e-${RUN}-og.png`, "E2E sharing image");
  await expect(page.locator(".adm-image-field").first()).toContainText(`e2e-${RUN}-og.png`);
  console.log("EDITOR: body, hero and sharing image each uploaded from the computer through the picker");

  // Every upload is a real media row with the alt text it was given.
  for (const [name, alt] of [[`e2e-${RUN}-body.png`, "E2E body image"], [`e2e-${RUN}-hero.png`, "E2E hero image"], [`e2e-${RUN}-og.png`, "E2E sharing image"]]) {
    const row = (await db().query<{ alt_text: string }>("select alt_text from media where filename = $1", [name])).rows[0];
    expect(row?.alt_text, `${name} stored with its alt text`).toBe(alt);
  }

  // Saved together, the post references all three.
  await page.getByRole("button", { name: "Create post" }).click();
  await page.waitForURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
  const saved = (await db().query<{ body_md: string; hero: string | null; og: string | null }>(
    `select p.body_md, h.filename as hero, o.filename as og from posts p left join media h on h.id = p.hero_image_id left join media o on o.id = p.og_image_id where p.slug = $1`,
    [`e2e-${RUN}-toolbar`],
  )).rows[0];
  expect(saved.body_md).toContain("![E2E body image](/media/");
  expect(saved.hero).toBe(`e2e-${RUN}-hero.png`);
  expect(saved.og).toBe(`e2e-${RUN}-og.png`);
  console.log("EDITOR: the saved post carries the formatted body, the uploaded hero and the uploaded sharing image");
  await context.close();
});
