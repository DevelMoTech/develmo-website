// Upload hygiene for the media library (brief §3.10), pure functions over
// bytes and unit tested:
//   - the content type is sniffed from magic numbers, the client's claim is
//     never consulted;
//   - SVG is rejected outright (script execution vector), as is anything
//     that is not JPEG, PNG, GIF or WebP;
//   - dimensions are read from the headers;
//   - metadata (EXIF, XMP, IPTC, ICC-less text chunks, comments) is stripped,
//     keeping only a minimal EXIF orientation tag for JPEGs so rotated photos
//     still display the right way up.

export const IMAGE_TYPES = ["jpeg", "png", "gif", "webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const CONTENT_TYPES: Record<ImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export const EXTENSIONS: Record<ImageType, string> = { jpeg: "jpg", png: "png", gif: "gif", webp: "webp" };

export function typeFromExtension(ext: string): ImageType | null {
  const e = ext.toLowerCase();
  if (e === "jpg" || e === "jpeg") return "jpeg";
  if (e === "png") return "png";
  if (e === "gif") return "gif";
  if (e === "webp") return "webp";
  return null;
}

export type Sniff = { ok: true; type: ImageType } | { ok: false; reason: "svg" | "unknown" | "empty" };

export function sniffImage(bytes: Uint8Array): Sniff {
  if (bytes.length < 12) return { ok: false, reason: bytes.length === 0 ? "empty" : "unknown" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ok: true, type: "jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { ok: true, type: "png" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { ok: true, type: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { ok: true, type: "webp" };
  // SVG: an XML document (with or without BOM / leading whitespace) whose
  // first element is <svg>, or any text that opens an <svg> tag early.
  // The BOM, if present, arrives as the three bytes EF BB BF.
  const head = ascii(bytes, 0, Math.min(bytes.length, 2048)).replace(/^\u00ef\u00bb\u00bf/, "").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype svg") || /<svg[\s>/]/.test(head)) return { ok: false, reason: "svg" };
  return { ok: false, reason: "unknown" };
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

export function imageDimensions(bytes: Uint8Array, type: ImageType): { width: number; height: number } | null {
  try {
    switch (type) {
      case "png":
        return ascii(bytes, 12, 16) === "IHDR" ? { width: be32(bytes, 16), height: be32(bytes, 20) } : null;
      case "gif":
        return { width: le16(bytes, 6), height: le16(bytes, 8) };
      case "jpeg":
        return jpegDimensions(bytes);
      case "webp":
        return webpDimensions(bytes);
    }
  } catch {
    return null;
  }
}

function jpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = be16(b, i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 9 <= b.length) return { height: be16(b, i + 5), width: be16(b, i + 7) };
    i += 2 + len;
  }
  return null;
}

function webpDimensions(b: Uint8Array): { width: number; height: number } | null {
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = ascii(b, i, i + 4);
    const size = le32(b, i + 4);
    const d = i + 8;
    if (fourcc === "VP8X" && d + 10 <= b.length) return { width: le24(b, d + 4) + 1, height: le24(b, d + 7) + 1 };
    if (fourcc === "VP8 " && d + 10 <= b.length) return { width: le16(b, d + 6) & 0x3fff, height: le16(b, d + 8) & 0x3fff };
    if (fourcc === "VP8L" && d + 5 <= b.length) {
      const bits = le32(b, d + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    i = d + size + (size & 1);
  }
  return null;
}

// EXIF orientation (1..8) from a JPEG's APP1 segment, 1 when absent.
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = be16(b, i + 2);
    if (marker === 0xe1 && ascii(b, i + 4, i + 10) === "Exif\0\0") {
      const t = i + 10; // TIFF header
      const little = ascii(b, t, t + 2) === "II";
      const r16 = (p: number) => (little ? le16(b, p) : be16(b, p));
      const r32 = (p: number) => (little ? le32(b, p) : be32(b, p));
      const ifd = t + r32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const n = r16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > b.length) break;
        if (r16(e) === 0x0112) {
          const v = r16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

// A minimal APP1 carrying only IFD0/Orientation, 34 bytes.
function orientationSegment(orientation: number): Uint8Array {
  const seg = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34 (includes the length field, excludes the marker)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation & 0xff, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  return seg;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const orientation = jpegOrientation(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  if (orientation !== 1) parts.push(orientationSegment(orientation));
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: everything to the end is entropy-coded data + EOI.
      parts.push(b.subarray(i));
      return concat(parts);
    }
    const len = be16(b, i + 2);
    const end = Math.min(b.length, i + 2 + len);
    // Drop APP1 (EXIF/XMP), APP3..APP13 (IPTC, Photoshop, etc.), APP15 and
    // COM. Keep APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe
    // colour transform), all of which affect how the pixels decode.
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!drop) parts.push(b.subarray(i, end));
    i = end;
  }
  parts.push(b.subarray(i));
  return concat(parts);
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const type = ascii(b, i + 4, i + 8);
    const end = Math.min(b.length, i + 12 + len);
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = ascii(b, i, i + 4);
    const size = le32(b, i + 4);
    const end = Math.min(b.length, i + 8 + size + (size & 1));
    if (fourcc === "EXIF" || fourcc === "XMP ") {
      i = end;
      continue;
    }
    const chunk = b.slice(i, end);
    // Clear the EXIF (0x08) and XMP (0x04) flags in the extended header.
    if (fourcc === "VP8X" && chunk.length >= 9) chunk[8] &= ~0x0c;
    chunks.push(chunk);
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >>> 8) & 0xff;
  header[6] = (riffSize >>> 16) & 0xff;
  header[7] = (riffSize >>> 24) & 0xff;
  header.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat([header, body]);
}

function gifSubBlocksEnd(b: Uint8Array, i: number): number {
  while (i < b.length) {
    const n = b[i];
    i += 1 + n;
    if (n === 0) break;
  }
  return Math.min(i, b.length);
}

function stripGif(b: Uint8Array): Uint8Array {
  const packed = b[10];
  let i = 13 + (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
  const parts: Uint8Array[] = [b.subarray(0, i)];
  while (i < b.length) {
    const intro = b[i];
    if (intro === 0x3b) {
      parts.push(b.subarray(i, i + 1));
      break;
    }
    if (intro === 0x2c) {
      const lp = b[i + 9];
      let j = i + 10 + (lp & 0x80 ? 3 * (1 << ((lp & 7) + 1)) : 0);
      j += 1; // LZW minimum code size
      j = gifSubBlocksEnd(b, j);
      parts.push(b.subarray(i, j));
      i = j;
      continue;
    }
    if (intro === 0x21) {
      const label = b[i + 1];
      const j = gifSubBlocksEnd(b, i + 2);
      // Keep graphic control (timing/transparency) and the NETSCAPE loop
      // extension; drop comments, plain text and other application data
      // (XMP lives in an application extension).
      let keep = label === 0xf9;
      if (label === 0xff && b[i + 2] === 11) keep = ascii(b, i + 3, i + 14) === "NETSCAPE2.0";
      if (keep) parts.push(b.subarray(i, j));
      i = j;
      continue;
    }
    // Unknown block: keep the remainder untouched rather than corrupt it.
    parts.push(b.subarray(i));
    break;
  }
  return concat(parts);
}

export function stripMetadata(bytes: Uint8Array, type: ImageType): Uint8Array {
  try {
    switch (type) {
      case "jpeg":
        return stripJpeg(bytes);
      case "png":
        return stripPng(bytes);
      case "webp":
        return stripWebp(bytes);
      case "gif":
        return stripGif(bytes);
    }
  } catch {
    return bytes;
  }
}

// Looks for the byte patterns metadata strippers remove; used by the unit
// tests and the upload route's self-check.
export function hasObviousMetadata(bytes: Uint8Array, type: ImageType): boolean {
  const s = ascii(bytes, 0, bytes.length);
  if (type === "jpeg") return /Exif\0\0|http:\/\/ns\.adobe\.com\/xap|Photoshop 3\.0/.test(s);
  if (type === "png") return /tEXt|zTXt|iTXt|eXIf/.test(s);
  if (type === "webp") return /EXIF|XMP /.test(s);
  if (type === "gif") return /XMP DataXMP/.test(s) || /\x21\xFE/.test(s);
  return false;
}
