import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_ORGANIZATION_FACTS } from "@/lib/seo/organization";
import { DEFAULT_ROBOTS_BODY } from "@/lib/seo/robots";
import { organizationFactsSchema, robotsBodySchema } from "@/lib/schemas/seo";

// Key-value settings (brief §3.11) with a zod schema per key. Reads fall back
// to the default on a missing row or a database error, so the site never
// depends on a settings row existing.

export const retentionSchema = z.object({
  // Months to keep rows before the cron hard-deletes them. 0 = keep forever.
  submissionsMonths: z.number().int().min(0).max(120),
  applicationsMonths: z.number().int().min(0).max(120),
});
export type Retention = z.infer<typeof retentionSchema>;
export const DEFAULT_RETENTION: Retention = { submissionsMonths: 24, applicationsMonths: 24 };

export const replyTemplateSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(4000),
});
export type ReplyTemplate = z.infer<typeof replyTemplateSchema>;
export const DEFAULT_REPLY_TEMPLATE: ReplyTemplate = {
  subject: "Re: your enquiry to DevelMo",
  body: ["Hi {{first_name}},", "", "Thanks for getting in touch about {{service}}.", "", "", "Best regards,", "", "DevelMo"].join("\n"),
};

// SEO manager (brief §3.6).
export const sitemapStateSchema = z.object({
  generatedAt: z.string().nullable(),
  urls: z.number().int().min(0),
});
export type SitemapState = z.infer<typeof sitemapStateSchema>;

const SCHEMAS = {
  retention: retentionSchema,
  reply_template: replyTemplateSchema,
  robots: robotsBodySchema,
  org_schema: organizationFactsSchema,
  sitemap_state: sitemapStateSchema,
} as const;
const DEFAULTS: { [K in keyof typeof SCHEMAS]: z.infer<(typeof SCHEMAS)[K]> } = {
  retention: DEFAULT_RETENTION,
  reply_template: DEFAULT_REPLY_TEMPLATE,
  robots: { body: DEFAULT_ROBOTS_BODY },
  org_schema: DEFAULT_ORGANIZATION_FACTS,
  sitemap_state: { generatedAt: null, urls: 0 },
};
export type SettingKey = keyof typeof SCHEMAS;

export async function getSetting<K extends SettingKey>(key: K): Promise<z.infer<(typeof SCHEMAS)[K]>> {
  try {
    const row = (await getDb().select().from(settings).where(eq(settings.key, key)).limit(1))[0];
    if (row) {
      const parsed = SCHEMAS[key].safeParse(row.value);
      if (parsed.success) return parsed.data as z.infer<(typeof SCHEMAS)[K]>;
    }
  } catch (err) {
    console.error("[settings] read failed, using default", key, err);
  }
  return DEFAULTS[key];
}

// Like getSetting, but a database failure throws instead of yielding the
// default. For the retention purge, where a default must never decide.
export async function getSettingStrict<K extends SettingKey>(key: K): Promise<z.infer<(typeof SCHEMAS)[K]>> {
  const row = (await getDb().select().from(settings).where(eq(settings.key, key)).limit(1))[0];
  if (!row) return DEFAULTS[key];
  return SCHEMAS[key].parse(row.value) as z.infer<(typeof SCHEMAS)[K]>;
}

export async function setSetting<K extends SettingKey>(key: K, value: z.infer<(typeof SCHEMAS)[K]>, actorId: string | null): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key, value, updatedById: actorId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedById: actorId, updatedAt: sql`now()` } });
}

// Removes the row so the default applies again.
export async function clearSetting(key: SettingKey): Promise<void> {
  await getDb().delete(settings).where(eq(settings.key, key));
}

export function settingDefault<K extends SettingKey>(key: K): z.infer<(typeof SCHEMAS)[K]> {
  return DEFAULTS[key];
}
