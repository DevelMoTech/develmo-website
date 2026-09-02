// CV upload hygiene (brief §3.4): PDF or DOCX, decided from the bytes, never
// from the file name or the client's content type. Pure and unit tested.

export const DOCUMENT_TYPES = ["pdf", "docx"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const MAX_CV_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_CONTENT_TYPES: Record<DocumentType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function documentTypeFromExtension(ext: string): DocumentType | null {
  const e = ext.toLowerCase();
  return e === "pdf" ? "pdf" : e === "docx" ? "docx" : null;
}

export type DocumentSniff = { ok: true; type: DocumentType } | { ok: false; reason: "empty" | "unsupported_type" | "active_content" };

function latin1(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// PDFs may carry scripts and launch actions; a CV never needs them, so those
// are refused rather than stored. DOCX is a zip that must contain the Word
// part list and must not be a macro-enabled document in disguise.
export function sniffDocument(bytes: Uint8Array): DocumentSniff {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  const head = latin1(bytes, 0, Math.min(bytes.length, 1024));
  if (head.includes("%PDF-")) {
    const all = latin1(bytes, 0, bytes.length);
    if (/\/(JavaScript|JS|Launch|RichMedia|EmbeddedFile)\b/.test(all)) return { ok: false, reason: "active_content" };
    return { ok: true, type: "pdf" };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const all = latin1(bytes, 0, bytes.length);
    if (all.includes("vbaProject.bin")) return { ok: false, reason: "active_content" };
    if (all.includes("[Content_Types].xml") && all.includes("word/document.xml")) return { ok: true, type: "docx" };
  }
  return { ok: false, reason: "unsupported_type" };
}
