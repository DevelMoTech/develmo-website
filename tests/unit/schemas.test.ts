import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import * as access from "@/lib/schemas/access";
import * as auth from "@/lib/schemas/auth";
import * as content from "@/lib/schemas/content";
import * as job from "@/lib/schemas/job";
import * as media from "@/lib/schemas/media";
import * as performance from "@/lib/schemas/performance";
import * as post from "@/lib/schemas/post";
import * as security from "@/lib/schemas/security";
import * as seo from "@/lib/schemas/seo";
import * as submission from "@/lib/schemas/submission";

// Brief §9.4: every zod schema is unit tested. The suites that predate this
// one, post-schema, jobposting, seo, security, performance and content-i18n,
// cover the schemas with interesting logic in depth. This file makes the
// coverage total: every exported schema accepts a realistic payload and
// rejects a realistic mistake, and the last test proves nothing was missed.

const UUID = "3f7d1c2e-9a4b-4c1d-8e2f-1a2b3c4d5e6f";
const UUID2 = "8b1e4a20-77cc-4c1f-9d3a-2e5f6a7b8c9d";

// Each case names the schema, one payload it must accept and one it must
// reject. The reject case is a plausible mistake, not a type error.
//
// `catchesTo` is for the one schema that must never reject: nextPathSchema
// guards an open redirect with .catch(), so a hostile value has to be
// neutralised rather than refused. There the bad value is asserted to parse
// into this safe result.
type Case = { name: string; schema: ZodType; ok: unknown; bad: unknown; catchesTo?: unknown };

const titleBody = { title: "Faster triage", body: "Cuts manual review time." };
const faq = { q: "How long does it take?", a: "About four weeks." };

const service = {
  slug: "computer-vision",
  pillar: "ai",
  title: "Computer Vision",
  blurb: "Cameras that count and classify.",
  intro: "We build vision systems.",
  capabilities: ["Detection"],
  tech: ["PyTorch"],
};

const industry = {
  slug: "retail",
  name: "Retail",
  icon: "cart",
  blurb: "Footfall and shrink.",
  challenge: "Stores cannot see what happens on the floor.",
  solutions: ["Queue analytics"],
};

const product = {
  slug: "crowdiq",
  title: "CrowdIQ",
  tagline: "See beyond the crowd.",
  summary: "Crowd analytics from existing cameras.",
  initial: "C",
  bg: "#021c26",
  fg: "#ffffff",
  badge: "live",
  features: ["Live occupancy"],
  href: "/our-products/crowdiq",
};

const about = {
  heading: "Who we are",
  lead: "An engineering company.",
  vision: "Useful AI.",
  mission: "Ship systems that work.",
  story: ["We started in 2019."],
  values: [titleBody],
  differentiators: [titleBody],
};

const siteFacts = {
  name: "DevelMo",
  url: "https://develmo.com",
  email: "hello@develmo.com",
  tagline: "AI that fits.",
  description: "We build AI systems.",
  phones: ["+44 20 7946 0000"],
  address: { line: "1 Example Street", city: "London", region: "England", postcode: "SW1A 1AA", country: "United Kingdom" },
  social: [{ name: "LinkedIn", href: "https://www.linkedin.com/company/develmo", icon: "linkedin" }],
  offices: [{ code: "UK", name: "London", desc: "Delivery and client work." }],
};

const jobFields = {
  title: "Computer Vision Engineer",
  slug: "computer-vision-engineer",
  department: "Engineering",
  location: "London",
  employmentType: "full-time",
  seniority: "mid",
  remotePolicy: "hybrid",
  salaryCurrency: "GBP",
  salaryPeriod: "year",
  status: "draft",
};

const postFields = {
  type: "blog",
  title: "Shipping AI features",
  slug: "shipping-ai-features",
  status: "draft",
};

const template = { subject: "Thanks for applying", body: "We have your application." };

const CASES: Case[] = [
  // ---- access requests ----
  { name: "accessRequestSchema", schema: access.accessRequestSchema, ok: { name: "Ada Lovelace", email: "ada@lovelace.test", reason: "I need to publish the launch post." }, bad: { name: "Ada Lovelace", email: "ada@lovelace.test", reason: "too short" } },
  { name: "accessDecisionSchema", schema: access.accessDecisionSchema, ok: { id: UUID, decision: "approve", role: "editor" }, bad: { id: UUID, decision: "approve" } },
  { name: "accessNotifySchema", schema: access.accessNotifySchema, ok: { notifyEmail: " Admin@DevelMo.com " }, bad: { notifyEmail: "admin at develmo" } },
  { name: "accessRequestIdSchema", schema: access.accessRequestIdSchema, ok: { id: UUID }, bad: { id: "latest" } },

  // ---- auth ----
  { name: "emailSchema", schema: auth.emailSchema, ok: "  Ada@Lovelace.TEST ", bad: "ada@lovelace" },
  { name: "passwordSchema", schema: auth.passwordSchema, ok: "correct horse battery", bad: "tooshort" },
  { name: "nextPathSchema", schema: auth.nextPathSchema, ok: "/admin/posts", bad: "https://evil.test/admin", catchesTo: "/admin" },
  { name: "loginSchema", schema: auth.loginSchema, ok: { email: "ada@lovelace.test", password: "x" }, bad: { email: "nope", password: "x" } },
  { name: "signupSchema", schema: auth.signupSchema, ok: { token: "t".repeat(24), name: "Ada", password: "correct horse battery" }, bad: { token: "short", name: "Ada", password: "correct horse battery" } },
  { name: "forgotPasswordSchema", schema: auth.forgotPasswordSchema, ok: { email: "ada@lovelace.test" }, bad: { email: "" } },
  { name: "resetPasswordSchema", schema: auth.resetPasswordSchema, ok: { token: "t".repeat(24), password: "correct horse battery" }, bad: { token: "t".repeat(24), password: "short" } },
  { name: "totpCodeSchema", schema: auth.totpCodeSchema, ok: " 123456 ", bad: "12345" },
  { name: "mfaVerifySchema", schema: auth.mfaVerifySchema, ok: { code: "123456" }, bad: { code: "123" } },
  { name: "mfaEnrolConfirmSchema", schema: auth.mfaEnrolConfirmSchema, ok: { code: "123456" }, bad: { code: "abcdef" } },
  { name: "changePasswordSchema", schema: auth.changePasswordSchema, ok: { currentPassword: "x", newPassword: "correct horse battery" }, bad: { currentPassword: "", newPassword: "correct horse battery" } },
  { name: "changeEmailSchema", schema: auth.changeEmailSchema, ok: { newEmail: "ada@lovelace.test", currentPassword: "x" }, bad: { newEmail: "ada@lovelace.test", currentPassword: "" } },
  { name: "updateProfileSchema", schema: auth.updateProfileSchema, ok: { name: "Ada" }, bad: { name: "   " } },
  { name: "revokeSessionSchema", schema: auth.revokeSessionSchema, ok: { sessionId: UUID }, bad: { sessionId: "not-a-uuid" } },
  { name: "inviteSchema", schema: auth.inviteSchema, ok: { email: "ada@lovelace.test", role: "editor" }, bad: { email: "ada@lovelace.test", role: "superuser" } },
  { name: "inviteIdSchema", schema: auth.inviteIdSchema, ok: { inviteId: UUID }, bad: { inviteId: "1" } },
  { name: "changeRoleSchema", schema: auth.changeRoleSchema, ok: { userId: UUID, role: "admin" }, bad: { userId: UUID, role: "root" } },
  { name: "userStatusSchema", schema: auth.userStatusSchema, ok: { userId: UUID, status: "deactivated" }, bad: { userId: UUID, status: "banned" } },
  { name: "deleteUserSchema", schema: auth.deleteUserSchema, ok: { userId: UUID, confirm: "ada@lovelace.test" }, bad: { userId: "x", confirm: "ada@lovelace.test" } },
  { name: "tokenQuerySchema", schema: auth.tokenQuerySchema, ok: "t".repeat(24), bad: "short" },

  // ---- content ----
  { name: "titleBodySchema", schema: content.titleBodySchema, ok: titleBody, bad: { title: "Faster triage", body: "" } },
  { name: "faqSchema", schema: content.faqSchema, ok: faq, bad: { q: "How long?", a: "  " } },
  { name: "pillarSchema", schema: content.pillarSchema, ok: { key: "ai-systems", title: "AI Systems", icon: "brain", blurb: "Models in production." }, bad: { key: "AI Systems", title: "AI Systems", icon: "brain", blurb: "Models in production." } },
  { name: "serviceSchema", schema: content.serviceSchema, ok: service, bad: { ...service, capabilities: [] } },
  { name: "industrySchema", schema: content.industrySchema, ok: industry, bad: { ...industry, solutions: [] } },
  { name: "productSchema", schema: content.productSchema, ok: product, bad: { ...product, href: "https://elsewhere.test" } },
  { name: "aboutSchema", schema: content.aboutSchema, ok: about, bad: { ...about, values: [] } },
  { name: "siteFactsSchema", schema: content.siteFactsSchema, ok: siteFacts, bad: { ...siteFacts, url: "develmo.com" } },
  { name: "statsSchema", schema: content.statsSchema, ok: [{ value: "40+", label: "Engineers" }], bad: [{ value: "", label: "Engineers" }] },
  { name: "techSchema", schema: content.techSchema, ok: ["PyTorch", "Next.js"], bad: [""] },
  { name: "navLinkSchema", schema: content.navLinkSchema, ok: { label: "Careers", href: "/jobs" }, bad: { label: "Careers", href: "javascript:alert(1)" } },
  { name: "navigationSchema", schema: content.navigationSchema, ok: content.DEFAULT_NAVIGATION, bad: { primary: [], company: content.DEFAULT_NAVIGATION.company } },
  { name: "saveEntrySchema", schema: content.saveEntrySchema, ok: { entity: "service", key: "computer-vision", data: service }, bad: { entity: "widget", key: "computer-vision", data: service } },
  { name: "translationSaveSchema", schema: content.translationSaveSchema, ok: { locale: "fr", key: "Contact", value: "Contact" }, bad: { locale: "de", key: "Contact", value: "Kontakt" } },
  { name: "leakRunSchema", schema: content.leakRunSchema, ok: { routes: ["/", "/what-we-do"], locales: ["ar", "fr"] }, bad: { routes: ["/search?q=1"], locales: ["ar"] } },

  // ---- job ----
  { name: "jobFieldsSchema", schema: job.jobFieldsSchema, ok: jobFields, bad: { ...jobFields, salaryMin: 90000, salaryMax: 50000 } },
  { name: "jobCreateSchema", schema: job.jobCreateSchema, ok: jobFields, bad: { ...jobFields, slug: "Not A Slug" } },
  { name: "jobUpdateSchema", schema: job.jobUpdateSchema, ok: { ...jobFields, id: UUID }, bad: { ...jobFields } },
  { name: "jobDeleteSchema", schema: job.jobDeleteSchema, ok: { id: UUID }, bad: { id: "" } },
  { name: "applicationSchema", schema: job.applicationSchema, ok: { name: "Ada Lovelace", email: "ada@lovelace.test", consent: true }, bad: { name: "Ada Lovelace", email: "ada@lovelace.test", consent: false } },
  { name: "applicationStageSchema", schema: job.applicationStageSchema, ok: { id: UUID, stage: "interview" }, bad: { id: UUID, stage: "ghosted" } },
  { name: "applicationRatingSchema", schema: job.applicationRatingSchema, ok: { id: UUID, rating: 4 }, bad: { id: UUID, rating: 9 } },
  { name: "applicationAssignSchema", schema: job.applicationAssignSchema, ok: { id: UUID, assigneeId: null }, bad: { id: UUID, assigneeId: "someone" } },
  { name: "applicationNoteSchema", schema: job.applicationNoteSchema, ok: { id: UUID, body: "Strong portfolio." }, bad: { id: UUID, body: "   " } },
  { name: "applicationDeleteSchema", schema: job.applicationDeleteSchema, ok: { id: UUID }, bad: {} },
  { name: "applicationRejectSchema", schema: job.applicationRejectSchema, ok: { id: UUID, ...template }, bad: { id: UUID, subject: "", body: "We have your application." } },
  { name: "emailTemplatesSchema", schema: job.emailTemplatesSchema, ok: { application_ack: template, application_rejection: template }, bad: { application_ack: template } },

  // ---- media ----
  { name: "folderSchema", schema: media.folderSchema, ok: "/Heroes/", bad: "heroes/Bad Folder" },
  { name: "altTextSchema", schema: media.altTextSchema, ok: "A queue at a checkout", bad: "x".repeat(301) },
  { name: "mediaUpdateSchema", schema: media.mediaUpdateSchema, ok: { id: UUID, altText: "A queue", filename: "queue.png" }, bad: { id: UUID, altText: "A queue", filename: "heroes/queue.png" } },
  { name: "mediaDeleteSchema", schema: media.mediaDeleteSchema, ok: { id: UUID }, bad: { id: 1 } },
  { name: "mediaIdSchema", schema: media.mediaIdSchema, ok: { id: UUID }, bad: { id: null } },
  { name: "mediaListQuerySchema", schema: media.mediaListQuerySchema, ok: { q: "queue", page: "2", withAlt: "1" }, bad: { page: "0" } },

  // ---- performance ----
  { name: "psiRunSchema", schema: performance.psiRunSchema, ok: { path: "/what-we-do", strategy: "mobile" }, bad: { path: "/admin", strategy: "mobile" } },
  { name: "revalidatePathSchema", schema: performance.revalidatePathSchema, ok: { path: "/our-products" }, bad: { path: "/api/admin/posts/create" } },
  { name: "revalidateTagSchema", schema: performance.revalidateTagSchema, ok: { tag: "services" }, bad: { tag: "everything" } },
  { name: "mediaSettingsSchema", schema: performance.mediaSettingsSchema, ok: performance.DEFAULT_MEDIA_SETTINGS, bad: { heroAutoplayMobile: true, posterOnlyMaxWidth: 5000 } },

  // ---- post ----
  { name: "slugSchema", schema: post.slugSchema, ok: "shipping-ai-features", bad: "Shipping--AI" },
  { name: "tagsSchema", schema: post.tagsSchema, ok: ["AI", "ai", "vision"], bad: Array.from({ length: 21 }, (_, i) => `tag-${i}`) },
  { name: "translationsSchema", schema: post.translationsSchema, ok: { fr: { title: "Titre" } }, bad: { de: { title: "Titel" } } },
  { name: "postFieldsSchema", schema: post.postFieldsSchema, ok: postFields, bad: { ...postFields, title: "" } },
  { name: "postCreateSchema", schema: post.postCreateSchema, ok: postFields, bad: { ...postFields, status: "scheduled" } },
  { name: "postUpdateSchema", schema: post.postUpdateSchema, ok: { ...postFields, id: UUID }, bad: { ...postFields, id: "nope" } },
  { name: "postBulkSchema", schema: post.postBulkSchema, ok: { ids: [UUID], action: "publish" }, bad: { ids: [UUID], action: "retag" } },
  { name: "postRestoreSchema", schema: post.postRestoreSchema, ok: { postId: UUID, revisionId: UUID2 }, bad: { postId: UUID } },
  { name: "postDeleteSchema", schema: post.postDeleteSchema, ok: { id: UUID }, bad: { id: "" } },
  { name: "markdownRenderSchema", schema: post.markdownRenderSchema, ok: { markdown: "# Title" }, bad: { markdown: 42 } },

  // ---- security ----
  { name: "accessRuleSchema", schema: security.accessRuleSchema, ok: { cidr: "203.0.113.0/24", action: "block" }, bad: { cidr: "203.0.113.0/99", action: "block" } },
  { name: "idSchema (security)", schema: security.idSchema, ok: { id: UUID }, bad: { id: "x" } },
  { name: "rateLimitSchema", schema: security.rateLimitSchema, ok: { key: "login", maxRequests: 5, windowSeconds: 900 }, bad: { key: "login", maxRequests: 5, windowSeconds: 1 } },
  { name: "turnstileSchema", schema: security.turnstileSchema, ok: { enabled: true, siteKey: "0x4AAA-BBBB_cccc" }, bad: { enabled: true, siteKey: "has spaces" } },
  { name: "securityRetentionSchema", schema: security.securityRetentionSchema, ok: { eventDays: 180 }, bad: { eventDays: -1 } },
  { name: "mfaPolicySchema", schema: security.mfaPolicySchema, ok: { mfa: "admins" }, bad: { mfa: "always" } },
  { name: "sessionRevokeSchema", schema: security.sessionRevokeSchema, ok: { sessionId: UUID }, bad: { sessionId: UUID.slice(1) } },
  { name: "userActionSchema", schema: security.userActionSchema, ok: { userId: UUID, action: "logout_all" }, bad: { userId: UUID, action: "delete_everything" } },
  { name: "headersCheckSchema", schema: security.headersCheckSchema, ok: { path: "/what-we-do" }, bad: { path: "/what-we-do?x=1" } },

  // ---- seo ----
  { name: "overrideSchema", schema: seo.overrideSchema, ok: { path: "/what-we-do", metaTitle: "What we do" }, bad: { path: "what-we-do" } },
  { name: "pathSchema", schema: seo.pathSchema, ok: { path: "/jobs" }, bad: { path: "/jobs#top" } },
  { name: "sitemapFieldsSchema", schema: seo.sitemapFieldsSchema, ok: { path: "/jobs", sitemapInclude: true, sitemapChangefreq: "weekly", sitemapPriority: 0.8 }, bad: { path: "/jobs", sitemapInclude: true, sitemapChangefreq: "weekly", sitemapPriority: 1.5 } },
  { name: "redirectSchema", schema: seo.redirectSchema, ok: { source: "/old", destination: "/new", code: 301, enabled: true }, bad: { source: "/old", destination: "/new", code: 307, enabled: true } },
  { name: "idSchema (seo)", schema: seo.idSchema, ok: { id: UUID }, bad: {} },
  { name: "robotsBodySchema", schema: seo.robotsBodySchema, ok: { body: "User-agent: *\nDisallow: /admin" }, bad: { body: "x".repeat(20_001) } },
  { name: "organizationFactsSchema", schema: seo.organizationFactsSchema, ok: { name: "DevelMo", email: "hello@develmo.com", description: "We build AI systems.", streetAddress: "1 Example Street", addressLocality: "London", postalCode: "SW1A 1AA", addressCountry: "United Kingdom" }, bad: { name: "DevelMo", email: "hello", description: "We build AI systems.", streetAddress: "1 Example Street", addressLocality: "London", postalCode: "SW1A 1AA", addressCountry: "United Kingdom" } },
  { name: "auditIdSchema", schema: seo.auditIdSchema, ok: { id: UUID }, bad: { id: "latest" } },

  // ---- submission ----
  { name: "submissionUpdateSchema", schema: submission.submissionUpdateSchema, ok: { id: UUID, status: "qualified" }, bad: { id: UUID } },
  { name: "submissionNoteSchema", schema: submission.submissionNoteSchema, ok: { id: UUID, body: "Called back." }, bad: { id: UUID, body: "" } },
  { name: "submissionSpamSchema", schema: submission.submissionSpamSchema, ok: { id: UUID, spam: true }, bad: { id: UUID, spam: "yes" } },
  { name: "submissionIdSchema", schema: submission.submissionIdSchema, ok: { id: UUID }, bad: { id: UUID.replace(/-/g, "") } },
  { name: "digestSchema", schema: submission.digestSchema, ok: { digest: "daily" }, bad: { digest: "hourly" } },
];

describe("every exported zod schema", () => {
  for (const c of CASES) {
    it(`${c.name} accepts a valid payload and rejects an invalid one`, () => {
      const good = c.schema.safeParse(c.ok);
      expect(good.success, `${c.name} rejected a payload it should accept: ${good.success ? "" : JSON.stringify(good.error.issues)}`).toBe(true);
      const bad = c.schema.safeParse(c.bad);
      if ("catchesTo" in c) {
        expect(bad.success, `${c.name} should neutralise the bad value, not reject it`).toBe(true);
        expect(bad.success && bad.data, `${c.name} did not neutralise the bad value`).toEqual(c.catchesTo);
        return;
      }
      expect(bad.success, `${c.name} accepted a payload it should reject`).toBe(false);
    });
  }
});

// The point of the file: if someone adds a schema and no test, this fails.
describe("schema coverage", () => {
  it("covers every schema exported from src/lib/schemas", () => {
    const modules: Record<string, Record<string, unknown>> = { access, auth, content, job, media, performance, post, security, seo, submission };
    const exported: string[] = [];
    for (const [file, mod] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(mod)) {
        if (!/[Ss]chema$/.test(name)) continue;
        if (typeof value !== "object" || value === null || typeof (value as ZodType).safeParse !== "function") continue;
        exported.push(`${file}.${name}`);
      }
    }
    const covered = new Set(CASES.map((c) => c.name.replace(/ \(.*\)$/, "")));
    const missing = exported.filter((full) => !covered.has(full.split(".")[1]));
    expect(missing, `these schemas have no case in this file: ${missing.join(", ")}`).toEqual([]);
    expect(exported.length).toBeGreaterThan(80);
  });
});
