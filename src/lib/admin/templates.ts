import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { emailTemplates } from "@/db/schema";
import { site } from "@/lib/site";

// Applicant email templates (brief §3.4): stored in email_templates, edited
// at /admin/jobs/templates, with these defaults until a row exists.
// Placeholders: {{name}}, {{first_name}}, {{job}}, {{company}}.

export type TemplateKey = "application_ack" | "application_rejection";
export type Template = { subject: string; body: string };

export const DEFAULT_TEMPLATES: Record<TemplateKey, Template> = {
  application_ack: {
    subject: "We received your application for {{job}}",
    body: [
      "Hi {{first_name}},",
      "",
      "Thanks for applying for the {{job}} role at {{company}}. Your application and CV are with the team.",
      "",
      "We read every application and will get back to you by email. If you have a question in the meantime, reply to this message.",
      "",
      "The {{company}} team",
    ].join("\n"),
  },
  application_rejection: {
    subject: "Your application for {{job}}",
    body: [
      "Hi {{first_name}},",
      "",
      "Thank you for taking the time to apply for the {{job}} role at {{company}}.",
      "",
      "After careful consideration we will not be taking your application further this time. That is not a judgement on your work, and we would be glad to hear from you again for a future role.",
      "",
      "Best wishes,",
      "The {{company}} team",
    ].join("\n"),
  },
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES) as TemplateKey[];

export async function getTemplate(key: TemplateKey): Promise<Template> {
  try {
    const row = (await getDb().select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1))[0];
    if (row) return { subject: row.subject, body: row.bodyMd };
  } catch (err) {
    console.error("[templates] read failed, using default", key, err);
  }
  return DEFAULT_TEMPLATES[key];
}

export async function saveTemplate(key: TemplateKey, t: Template, actorId: string | null): Promise<void> {
  await getDb()
    .insert(emailTemplates)
    .values({ key, subject: t.subject, bodyMd: t.body, updatedById: actorId })
    .onConflictDoUpdate({ target: emailTemplates.key, set: { subject: t.subject, bodyMd: t.body, updatedById: actorId, updatedAt: sql`now()` } });
}

export function renderTemplate(text: string, vars: { name: string; job: string }): string {
  const firstName = vars.name.trim().split(/\s+/)[0] || vars.name;
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*name\s*\}\}/g, vars.name)
    .replace(/\{\{\s*job\s*\}\}/g, vars.job)
    .replace(/\{\{\s*company\s*\}\}/g, site.name);
}
