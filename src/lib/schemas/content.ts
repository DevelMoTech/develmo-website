import { z } from "zod";

// Client-safe zod schemas mirroring the typed content in src/lib exactly
// (brief §3.9). The optional shapes matter: `outcomes[]`, `faqs[]`, `intro`
// and `howItWorks[]` are rendered behind guards, and the service, industry
// and product detail pages emit FAQPage JSON-LD from `faqs`. An optional
// field must stay optional and, when present, must keep its shape, or the
// structured data on 31 pages breaks.

const slug = z
  .string()
  .trim()
  .min(1, "A slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and single hyphens");

const line = (max: number, label: string) => z.string().trim().min(1, `${label} is required`).max(max);
const lines = (max: number) => z.array(z.string().trim().min(1).max(max));

// { title, body } pairs, used by outcomes, values, differentiators and
// howItWorks. Both halves are required whenever an entry exists.
export const titleBodySchema = z.object({
  title: line(200, "Title"),
  body: line(2000, "Body"),
});

// { q, a } pairs. These become FAQPage JSON-LD, so an entry with an empty
// question or answer would emit invalid structured data and is refused.
export const faqSchema = z.object({
  q: line(300, "Question"),
  a: line(2000, "Answer"),
});

export const pillarSchema = z.object({
  key: slug,
  title: line(120, "Title"),
  icon: line(60, "Icon"),
  blurb: line(400, "Blurb"),
});
export type PillarInput = z.infer<typeof pillarSchema>;

export const serviceSchema = z.object({
  slug,
  pillar: slug,
  title: line(160, "Title"),
  blurb: line(600, "Blurb"),
  intro: line(3000, "Intro"),
  capabilities: lines(400).min(1, "At least one capability"),
  tech: lines(120),
  // Optional in the type and optional here. Absent stays absent.
  outcomes: z.array(titleBodySchema).max(12).optional(),
  faqs: z.array(faqSchema).max(20).optional(),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const industrySchema = z.object({
  slug,
  name: line(160, "Name"),
  icon: line(60, "Icon"),
  blurb: line(600, "Blurb"),
  challenge: line(3000, "Challenge"),
  approach: z.string().trim().max(3000).optional(),
  solutions: lines(400).min(1, "At least one solution"),
  outcomes: z.array(titleBodySchema).max(12).optional(),
  faqs: z.array(faqSchema).max(20).optional(),
});
export type IndustryInput = z.infer<typeof industrySchema>;

export const productSchema = z.object({
  slug,
  title: line(160, "Title"),
  tagline: line(600, "Tagline"),
  summary: line(3000, "Summary"),
  initial: line(4, "Initial"),
  bg: line(60, "Background"),
  fg: line(60, "Foreground"),
  badge: z.enum(["live", "soon"]),
  features: lines(400).min(1, "At least one feature"),
  stats: lines(200).optional(),
  forWho: z.string().trim().max(600).optional(),
  href: z.string().trim().min(1).max(300).regex(/^\/[^\s]*$/, "A path starting with /"),
  intro: z.string().trim().max(3000).optional(),
  howItWorks: z.array(titleBodySchema).max(12).optional(),
  faqs: z.array(faqSchema).max(20).optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const aboutSchema = z.object({
  heading: line(200, "Heading"),
  lead: line(3000, "Lead"),
  vision: line(3000, "Vision"),
  mission: line(3000, "Mission"),
  story: lines(4000).min(1, "At least one paragraph"),
  values: z.array(titleBodySchema).min(1, "At least one value"),
  differentiators: z.array(titleBodySchema).min(1, "At least one differentiator"),
});
export type AboutInput = z.infer<typeof aboutSchema>;

// The company facts in site.ts. `nav` is edited on the navigation page, so it
// is not part of this form.
export const siteFactsSchema = z.object({
  name: line(120, "Name"),
  url: z.string().trim().url().max(300),
  email: z.string().trim().email().max(200),
  tagline: line(300, "Tagline"),
  description: line(2000, "Description"),
  phones: lines(40).max(10),
  address: z.object({
    line: line(200, "Address line"),
    city: line(120, "City"),
    region: line(120, "Region"),
    postcode: line(40, "Postcode"),
    country: line(120, "Country"),
  }),
  social: z
    .array(
      z.object({
        name: line(60, "Name"),
        href: z.string().trim().url().max(500),
        icon: line(40, "Icon"),
      }),
    )
    .max(20),
  offices: z
    .array(
      z.object({
        code: line(8, "Code"),
        name: line(120, "Name"),
        desc: line(600, "Description"),
      }),
    )
    .max(20),
});
export type SiteFactsInput = z.infer<typeof siteFactsSchema>;

export const statsSchema = z.array(z.object({ value: line(40, "Value"), label: line(120, "Label") })).max(12);
export type StatsInput = z.infer<typeof statsSchema>;

export const techSchema = z.array(line(60, "Entry")).max(60);
export type TechInput = z.infer<typeof techSchema>;

// Navigation (brief §3.9). The top bar and the company panel are lists of
// links; the service, industry and product groups in the mega menu come from
// the content editors, so reordering a service reorders the menu.
export const navLinkSchema = z.object({
  label: line(80, "Label"),
  href: z.string().trim().min(1).max(300).regex(/^(\/[^\s]*|https?:\/\/\S+|mailto:\S+)$/, "A site path, an absolute URL or a mailto link"),
});

export const navigationSchema = z.object({
  primary: z.array(navLinkSchema).min(1, "At least one primary link").max(12),
  company: z.array(navLinkSchema).min(1, "At least one company link").max(16),
});
export type NavigationInput = z.infer<typeof navigationSchema>;

export const DEFAULT_NAVIGATION: NavigationInput = {
  primary: [
    { label: "What We Do", href: "/what-we-do" },
    { label: "Who We Help", href: "/who-we-help" },
    { label: "Our Products", href: "/our-products" },
    { label: "Who We Are", href: "/who-we-are" },
    { label: "Insights", href: "/our-blogs" },
  ],
  company: [
    { label: "Who We Are", href: "/who-we-are" },
    { label: "About DevelMo", href: "/who-we-are/about-develmo" },
    { label: "Careers", href: "/jobs" },
    { label: "Knowledge Base", href: "/our-knowledge-base" },
    { label: "Insights", href: "/our-blogs" },
    { label: "Contact", href: "/contact-develmo" },
  ],
};

export const ENTITIES = ["pillar", "service", "industry", "product", "about"] as const;
export type ContentEntity = (typeof ENTITIES)[number];

export const saveEntrySchema = z.object({
  entity: z.enum(ENTITIES),
  key: z.string().trim().min(1).max(120),
  data: z.unknown(),
});

export const reorderSchema = z.object({
  entity: z.enum(ENTITIES),
  keys: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
});

export const translationSaveSchema = z.object({
  locale: z.enum(["ar", "ur", "fr", "es"]),
  key: z.string().min(1).max(1000),
  // Empty clears the override and lets the file value apply again.
  value: z.string().max(4000),
});
export type TranslationSaveInput = z.infer<typeof translationSaveSchema>;

export const leakRunSchema = z.object({
  routes: z.array(z.string().trim().regex(/^\/[^\s?#]*$/)).min(1).max(30),
  locales: z.array(z.enum(["ar", "ur", "fr", "es"])).min(1).max(4),
});
export type LeakRunInput = z.infer<typeof leakRunSchema>;
