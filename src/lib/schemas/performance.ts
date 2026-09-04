import { z } from "zod";

// Client-safe zod schemas for the performance manager (no server imports).

export const PSI_STRATEGIES = ["mobile", "desktop"] as const;
export type PsiStrategy = (typeof PSI_STRATEGIES)[number];

const publicPath = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^\/[^\s?#]*$/, "A path starting with /")
  .refine((p) => !/^\/(admin|api)(\/|$)/.test(p), "The console and the API are not measured here");

export const psiRunSchema = z.object({
  path: publicPath,
  strategy: z.enum(PSI_STRATEGIES),
});
export type PsiRunInput = z.infer<typeof psiRunSchema>;

export const revalidatePathSchema = z.object({
  path: publicPath,
  // "page" refreshes one URL; "layout" refreshes it and everything beneath.
  type: z.enum(["page", "layout"]).default("page"),
});
export type RevalidatePathInput = z.infer<typeof revalidatePathSchema>;

// The tags the repo layer actually uses. A free-text field would let someone
// type a tag that revalidates nothing and looks like it worked.
export const CACHE_TAGS = [
  "content",
  "services",
  "industries",
  "products",
  "about",
  "posts",
  "jobs",
  "seo",
  "sitemap",
  "robots",
  "redirects",
  "schema",
  "ip-rules",
  "turnstile",
  "media",
] as const;
export type CacheTag = (typeof CACHE_TAGS)[number];

export const revalidateTagSchema = z.object({ tag: z.enum(CACHE_TAGS) });
export type RevalidateTagInput = z.infer<typeof revalidateTagSchema>;

// Media settings read by HeroStage. The defaults reproduce today's
// behaviour exactly: the clips autoplay everywhere, and no breakpoint falls
// back to posters.
export const mediaSettingsSchema = z.object({
  heroAutoplayMobile: z.boolean(),
  // Viewports at or below this width show the poster and never fetch the
  // video. 0 disables the breakpoint.
  posterOnlyMaxWidth: z.number().int().min(0).max(2000),
});
export type MediaSettings = z.infer<typeof mediaSettingsSchema>;
export const DEFAULT_MEDIA_SETTINGS: MediaSettings = { heroAutoplayMobile: true, posterOnlyMaxWidth: 0 };
