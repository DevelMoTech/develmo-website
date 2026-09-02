import { describe, expect, it } from "vitest";
import { postBulkSchema, postCreateSchema, postUpdateSchema } from "@/lib/schemas/post";

const base = {
  type: "blog",
  title: "A post",
  slug: "a-post",
  status: "draft",
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.success ? [] : result.error!.issues.map((i) => i.path.join("."));
}

describe("postCreateSchema", () => {
  it("accepts a minimal draft and fills defaults", () => {
    const r = postCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.excerpt).toBe("");
    expect(r.data.bodyMd).toBe("");
    expect(r.data.tags).toEqual([]);
    expect(r.data.authorName).toBe("DevelMo Team");
    expect(r.data.heroImageId).toBeNull();
    expect(r.data.publishedAt).toBeNull();
    expect(r.data.noindex).toBe(false);
    expect(r.data.translations).toEqual({});
  });

  it("requires a title and a well-formed slug", () => {
    expect(issues(postCreateSchema.safeParse({ ...base, title: "  " }))).toContain("title");
    expect(issues(postCreateSchema.safeParse({ ...base, slug: "Bad Slug" }))).toContain("slug");
    expect(issues(postCreateSchema.safeParse({ ...base, slug: "" }))).toContain("slug");
  });

  it("rejects unknown types and statuses", () => {
    expect(issues(postCreateSchema.safeParse({ ...base, type: "news" }))).toContain("type");
    expect(issues(postCreateSchema.safeParse({ ...base, status: "live" }))).toContain("status");
  });

  it("lowercases and de-duplicates tags, capping at 20", () => {
    const r = postCreateSchema.safeParse({ ...base, tags: ["AI", "ai", " Vision "] });
    expect(r.success && r.data.tags).toEqual(["ai", "vision"]);
    expect(issues(postCreateSchema.safeParse({ ...base, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))).toContain("tags");
  });

  it("a scheduled post needs a future time", () => {
    expect(issues(postCreateSchema.safeParse({ ...base, status: "scheduled" }))).toContain("publishedAt");
    expect(issues(postCreateSchema.safeParse({ ...base, status: "scheduled", publishedAt: "2020-01-01T00:00:00Z" }))).toContain("publishedAt");
    const future = new Date(Date.now() + 3600_000).toISOString();
    const r = postCreateSchema.safeParse({ ...base, status: "scheduled", publishedAt: future });
    expect(r.success).toBe(true);
    expect(r.success && r.data.publishedAt).toBeInstanceOf(Date);
  });

  it("treats empty strings as null for optional SEO fields and validates the canonical", () => {
    const r = postCreateSchema.safeParse({ ...base, metaTitle: "", metaDescription: " ", canonicalOverride: "" });
    expect(r.success && r.data.metaTitle).toBeNull();
    expect(r.success && r.data.metaDescription).toBeNull();
    expect(r.success && r.data.canonicalOverride).toBeNull();
    expect(postCreateSchema.safeParse({ ...base, canonicalOverride: "https://example.com/x" }).success).toBe(true);
    expect(postCreateSchema.safeParse({ ...base, canonicalOverride: "/our-blogs/x" }).success).toBe(true);
    expect(issues(postCreateSchema.safeParse({ ...base, canonicalOverride: "http://insecure.example" }))).toContain("canonicalOverride");
    expect(issues(postCreateSchema.safeParse({ ...base, canonicalOverride: "//evil.example" }))).toContain("canonicalOverride");
    expect(issues(postCreateSchema.safeParse({ ...base, canonicalOverride: "javascript:alert(1)" }))).toContain("canonicalOverride");
  });

  it("validates media ids as uuids", () => {
    expect(issues(postCreateSchema.safeParse({ ...base, heroImageId: "not-a-uuid" }))).toContain("heroImageId");
    expect(postCreateSchema.safeParse({ ...base, heroImageId: "3f0e2c7a-4a3e-4a6b-9a4f-0c8f2f7d1b2e" }).success).toBe(true);
  });

  it("accepts translations only for the supported locales", () => {
    const ok = postCreateSchema.safeParse({ ...base, translations: { ar: { title: "عنوان" }, fr: { bodyMd: "Corps" } } });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.translations.ar?.excerpt).toBe("");
    expect(issues(postCreateSchema.safeParse({ ...base, translations: { de: { title: "x" } } }))).toContain("translations");
    expect(issues(postCreateSchema.safeParse({ ...base, translations: { en: { title: "x" } } }))).toContain("translations");
  });

  it("caps the body length", () => {
    expect(issues(postCreateSchema.safeParse({ ...base, bodyMd: "x".repeat(200_001) }))).toContain("bodyMd");
  });
});

describe("postUpdateSchema", () => {
  it("requires the post id and defaults createRedirect on", () => {
    expect(issues(postUpdateSchema.safeParse(base))).toContain("id");
    const r = postUpdateSchema.safeParse({ ...base, id: "3f0e2c7a-4a3e-4a6b-9a4f-0c8f2f7d1b2e" });
    expect(r.success && r.data.createRedirect).toBe(true);
  });
});

describe("postBulkSchema", () => {
  const ids = ["3f0e2c7a-4a3e-4a6b-9a4f-0c8f2f7d1b2e"];
  it("needs ids and a known action", () => {
    expect(issues(postBulkSchema.safeParse({ ids: [], action: "publish" }))).toContain("ids");
    expect(issues(postBulkSchema.safeParse({ ids, action: "explode" }))).toContain("action");
    expect(postBulkSchema.safeParse({ ids, action: "archive" }).success).toBe(true);
  });
  it("retag needs at least one tag to add or remove", () => {
    expect(issues(postBulkSchema.safeParse({ ids, action: "retag" }))).toContain("addTags");
    expect(postBulkSchema.safeParse({ ids, action: "retag", removeTags: ["old"] }).success).toBe(true);
  });
});
