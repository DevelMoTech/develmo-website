import type { ReplyTemplate } from "@/lib/admin/settings";

// mailto: reply prefilled from the configurable template (brief §3.5).
// Placeholders: {{first_name}}, {{name}}, {{company}}, {{service}}, {{message}}.
export function renderReply(template: ReplyTemplate, row: { name: string; company: string; service: string; message: string }): { subject: string; body: string } {
  const firstName = row.name.trim().split(/\s+/)[0] || row.name;
  // Function replacements: visitor text is inserted verbatim, never
  // interpreted as a "$&"-style replacement pattern.
  const fill = (s: string) =>
    s
      .replace(/\{\{\s*first_name\s*\}\}/g, () => firstName)
      .replace(/\{\{\s*name\s*\}\}/g, () => row.name)
      .replace(/\{\{\s*company\s*\}\}/g, () => row.company)
      .replace(/\{\{\s*service\s*\}\}/g, () => row.service || "your project")
      .replace(/\{\{\s*message\s*\}\}/g, () => row.message);
  return { subject: fill(template.subject), body: fill(template.body) };
}

export function mailtoFor(email: string, reply: { subject: string; body: string }): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}`;
}
