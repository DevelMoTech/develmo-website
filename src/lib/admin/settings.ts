import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_ORGANIZATION_FACTS } from "@/lib/seo/organization";
import { DEFAULT_ROBOTS_BODY } from "@/lib/seo/robots";
import { organizationFactsSchema, robotsBodySchema } from "@/lib/schemas/seo";
import { DEFAULT_MFA_POLICY, DEFAULT_ROLE_ACCESS, DEFAULT_SECURITY_RETENTION, DEFAULT_TURNSTILE, mfaPolicySchema, roleAccessSchema, securityRetentionSchema, turnstileSchema } from "@/lib/schemas/security";
import { DEFAULT_MEDIA_SETTINGS, mediaSettingsSchema } from "@/lib/schemas/performance";
import { DEFAULT_NAVIGATION, navigationSchema } from "@/lib/schemas/content";
import { accessNotifySchema, type AccessNotifyInput } from "@/lib/schemas/access";

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
  turnstile: turnstileSchema,
  security_retention: securityRetentionSchema,
  media: mediaSettingsSchema,
  navigation: navigationSchema,
  access_requests: accessNotifySchema,
  auth_policy: mfaPolicySchema,
  role_access: roleAccessSchema,
} as const;

// Who is told about a new access request. The default is the address the
// contact form already delivers to, so out of the box both kinds of "someone
// wants something from us" land in the same inbox.
export const DEFAULT_ACCESS_NOTIFY: AccessNotifyInput = { notifyEmail: process.env.CONTACT_TO || "s.shahzeb8874@gmail.com" };
const DEFAULTS: { [K in keyof typeof SCHEMAS]: z.infer<(typeof SCHEMAS)[K]> } = {
  retention: DEFAULT_RETENTION,
  reply_template: DEFAULT_REPLY_TEMPLATE,
  robots: { body: DEFAULT_ROBOTS_BODY },
  org_schema: DEFAULT_ORGANIZATION_FACTS,
  sitemap_state: { generatedAt: null, urls: 0 },
  turnstile: DEFAULT_TURNSTILE,
  security_retention: DEFAULT_SECURITY_RETENTION,
  media: DEFAULT_MEDIA_SETTINGS,
  navigation: DEFAULT_NAVIGATION,
  access_requests: DEFAULT_ACCESS_NOTIFY,
  auth_policy: DEFAULT_MFA_POLICY,
  role_access: DEFAULT_ROLE_ACCESS,
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
    // A warning with a message, not console.error with the Error: this is the
    // designed fallback, and Next forwards a server console.error into the
    // browser in development, where it reads as a broken page.
    console.warn(`[settings] ${key} read failed, using the default: ${err instanceof Error ? err.message : String(err)}`);
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
