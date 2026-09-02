import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { sniffDocument } from "@/lib/documents";
import { applicationSchema, jobCreateSchema } from "@/lib/schemas/job";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

// Minimal zip with the given entries (stored, no compression needed for the
// sniff: only local headers and names matter).
function zip(entries: Record<string, string>): Uint8Array {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(entries)) {
    const data = deflateRawSync(Buffer.from(content));
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(name.length, 26);
    parts.push(header, Buffer.from(name), data);
  }
  return new Uint8Array(Buffer.concat(parts));
}

describe("sniffDocument", () => {
  it("accepts a PDF by its header, wherever the name says otherwise", () => {
    expect(sniffDocument(enc("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"))).toEqual({ ok: true, type: "pdf" });
    expect(sniffDocument(enc("\xEF\xBB\xBF   %PDF-1.4 stream"))).toEqual({ ok: true, type: "pdf" });
  });

  it("refuses PDFs with scripts, launch actions or embedded files", () => {
    expect(sniffDocument(enc("%PDF-1.7 << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"))).toEqual({ ok: false, reason: "active_content" });
    expect(sniffDocument(enc("%PDF-1.7 << /S /Launch /F (cmd.exe) >>"))).toEqual({ ok: false, reason: "active_content" });
    expect(sniffDocument(enc("%PDF-1.7 << /Type /EmbeddedFile >>"))).toEqual({ ok: false, reason: "active_content" });
  });

  it("accepts a DOCX zip with the Word document part", () => {
    const docx = zip({ "[Content_Types].xml": "<Types/>", "_rels/.rels": "<Relationships/>", "word/document.xml": "<w:document/>" });
    expect(sniffDocument(docx)).toEqual({ ok: true, type: "docx" });
  });

  it("refuses macro-enabled documents, other zips and everything else", () => {
    expect(sniffDocument(zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document/>", "word/vbaProject.bin": "macro" }))).toEqual({ ok: false, reason: "active_content" });
    expect(sniffDocument(zip({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>" }))).toEqual({ ok: false, reason: "unsupported_type" });
    expect(sniffDocument(enc("MZ\x90\0 not a cv"))).toEqual({ ok: false, reason: "unsupported_type" });
    expect(sniffDocument(enc("<html><body>cv</body></html>"))).toEqual({ ok: false, reason: "unsupported_type" });
    expect(sniffDocument(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
  });
});

describe("job schemas", () => {
  const job = { title: "ML Engineer", slug: "ml-engineer", employmentType: "full-time", remotePolicy: "hybrid", salaryCurrency: "GBP", status: "draft" };
  const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.path.join(".")));

  it("accepts a minimal job and fills defaults", () => {
    const r = jobCreateSchema.safeParse(job);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.officeCode).toBeNull();
    expect(r.data.salaryMin).toBeNull();
    expect(r.data.salaryPeriod).toBe("year");
    expect(r.data.seniority).toBe("");
  });

  it("checks offices, salary order, date order and enumerations", () => {
    expect(issues(jobCreateSchema.safeParse({ ...job, officeCode: "FR" }))).toContain("officeCode");
    expect(issues(jobCreateSchema.safeParse({ ...job, salaryMin: "50000", salaryMax: "40000" }))).toContain("salaryMax");
    expect(issues(jobCreateSchema.safeParse({ ...job, opensAt: "2026-10-01T00:00:00Z", closesAt: "2026-09-01T00:00:00Z" }))).toContain("closesAt");
    expect(issues(jobCreateSchema.safeParse({ ...job, employmentType: "gig" }))).toContain("employmentType");
    expect(issues(jobCreateSchema.safeParse({ ...job, salaryCurrency: "BTC" }))).toContain("salaryCurrency");
    expect(issues(jobCreateSchema.safeParse({ ...job, salaryMin: "12.5" }))).toContain("salaryMin");
    const ok = jobCreateSchema.safeParse({ ...job, officeCode: "PK", salaryMin: "40000", salaryMax: "", opensAt: "", closesAt: "2026-12-01T00:00:00Z" });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.salaryMin).toBe(40000);
    expect(ok.success && ok.data.closesAt).toBeInstanceOf(Date);
  });

  it("validates the public application", () => {
    const app = { name: "Ada Lovelace", email: "Ada@Example.com", consent: true };
    const r = applicationSchema.safeParse(app);
    expect(r.success && r.data.email).toBe("ada@example.com");
    expect(r.success && r.data.locale).toBe("en");
    expect(issues(applicationSchema.safeParse({ ...app, consent: false }))).toContain("consent");
    expect(issues(applicationSchema.safeParse({ ...app, name: "A" }))).toContain("name");
    expect(issues(applicationSchema.safeParse({ ...app, linkedinUrl: "https://example.com/me" }))).toContain("linkedinUrl");
    expect(applicationSchema.safeParse({ ...app, linkedinUrl: "https://www.linkedin.com/in/ada" }).success).toBe(true);
    expect(issues(applicationSchema.safeParse({ ...app, portfolioUrl: "javascript:alert(1)" }))).toContain("portfolioUrl");
    expect(issues(applicationSchema.safeParse({ ...app, locale: "de" }))).toContain("locale");
  });
});
