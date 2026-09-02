import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { hasObviousMetadata, imageDimensions, jpegOrientation, sniffImage, stripMetadata } from "@/lib/images";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const cat = (...parts: (Uint8Array | number[])[]) => new Uint8Array(parts.flatMap((p) => [...p]));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = cat(enc(type), data);
  return cat(be32(data.length), body, be32(crc32(body)));
}

function png(width: number, height: number, withText = true): Uint8Array {
  const ihdr = cat(be32(width), be32(height), [8, 6, 0, 0, 0]);
  const raw = new Uint8Array(height * (1 + width * 4));
  const idat = new Uint8Array(deflateSync(raw));
  return cat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", ihdr),
    withText ? pngChunk("tEXt", enc("Comment\0made by a camera")) : [],
    withText ? pngChunk("eXIf", enc("II*\0\x08\0\0\0\0\0")) : [],
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

function jpegSegment(marker: number, data: Uint8Array): Uint8Array {
  return cat([0xff, marker], be16(data.length + 2), data);
}

function jpeg(width: number, height: number, orientation = 1): Uint8Array {
  // EXIF APP1 with IFD0 containing Orientation and a Make tag.
  const tiff = cat(enc("MM\0\x2a"), be32(8), be16(2), be16(0x0112), be16(3), be32(1), be16(orientation), [0, 0], be16(0x010f), be16(2), be32(4), enc("ACME"), be32(0));
  const app1 = jpegSegment(0xe1, cat(enc("Exif\0\0"), tiff));
  const app0 = jpegSegment(0xe0, cat(enc("JFIF\0"), [1, 1, 0], be16(72), be16(72), [0, 0]));
  const com = jpegSegment(0xfe, enc("Shot on a phone at home"));
  const xmp = jpegSegment(0xe1, enc("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"));
  const icc = jpegSegment(0xe2, enc("ICC_PROFILE\0\x01\x01profile-bytes"));
  const sof = jpegSegment(0xc0, cat([8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
  const sos = jpegSegment(0xda, cat([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]));
  return cat([0xff, 0xd8], app0, app1, xmp, icc, com, sof, sos, [0x12, 0x34, 0x56], [0xff, 0xd9]);
}

function gif(width: number, height: number): Uint8Array {
  const comment = cat([0x21, 0xfe], [5], enc("hello"), [0]);
  const netscape = cat([0x21, 0xff], [11], enc("NETSCAPE2.0"), [3, 1, 0, 0], [0]);
  const xmp = cat([0x21, 0xff], [11], enc("XMP DataXMP"), [4], enc("<xmp"), [0]);
  const image = cat([0x2c], le16(0), le16(0), le16(width), le16(height), [0], [2], [2, 0x44, 0x01], [0]);
  return cat(enc("GIF89a"), le16(width), le16(height), [0, 0, 0], comment, netscape, xmp, image, [0x3b]);
}

function webp(width: number, height: number): Uint8Array {
  const vp8x = cat(enc("VP8X"), le32(10), [0x0c | 0x10, 0, 0, 0], [...le32(width - 1).slice(0, 3)], [...le32(height - 1).slice(0, 3)]);
  const exif = cat(enc("EXIF"), le32(6), enc("MM\0\x2a\0\0"));
  const bits = (width - 1) | ((height - 1) << 14);
  const vp8l = cat(enc("VP8L"), le32(6), [0x2f], le32(bits), [0]);
  const body = cat(vp8x, exif, vp8l);
  return cat(enc("RIFF"), le32(body.length + 4), enc("WEBP"), body);
}

describe("sniffImage", () => {
  it("recognises the four supported formats from bytes alone", () => {
    expect(sniffImage(png(1, 1))).toEqual({ ok: true, type: "png" });
    expect(sniffImage(jpeg(2, 3))).toEqual({ ok: true, type: "jpeg" });
    expect(sniffImage(gif(2, 3))).toEqual({ ok: true, type: "gif" });
    expect(sniffImage(webp(2, 3))).toEqual({ ok: true, type: "webp" });
  });

  it("rejects SVG in every disguise", () => {
    expect(sniffImage(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toEqual({ ok: false, reason: "svg" });
    expect(sniffImage(enc('<?xml version="1.0"?>\n<svg></svg>'))).toEqual({ ok: false, reason: "svg" });
    expect(sniffImage(enc("\xEF\xBB\xBF   \n<SVG viewBox='0 0 1 1'/>"))).toEqual({ ok: false, reason: "svg" });
    expect(sniffImage(enc("<!-- comment -->\n<svg/>          "))).toEqual({ ok: false, reason: "svg" });
  });

  it("rejects everything else, including images renamed to look like text or PDFs", () => {
    expect(sniffImage(enc("%PDF-1.7 hello world"))).toEqual({ ok: false, reason: "unknown" });
    expect(sniffImage(enc("GIF89a"))).toEqual({ ok: false, reason: "unknown" });
    expect(sniffImage(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
    expect(sniffImage(enc("MZ\x90\0this is an exe"))).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("imageDimensions", () => {
  it("reads width and height from each header", () => {
    expect(imageDimensions(png(640, 480), "png")).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(jpeg(1200, 630), "jpeg")).toEqual({ width: 1200, height: 630 });
    expect(imageDimensions(gif(16, 9), "gif")).toEqual({ width: 16, height: 9 });
    expect(imageDimensions(webp(300, 200), "webp")).toEqual({ width: 300, height: 200 });
  });
});

describe("stripMetadata", () => {
  it("removes EXIF, XMP and comments from a JPEG but keeps JFIF, the ICC profile and the pixels", () => {
    const original = jpeg(4, 4, 6);
    expect(hasObviousMetadata(original, "jpeg")).toBe(true);
    const stripped = stripMetadata(original, "jpeg");
    const text = Buffer.from(stripped).toString("latin1");
    expect(text).not.toContain("ACME");
    expect(text).not.toContain("xap/1.0");
    expect(text).not.toContain("Shot on a phone");
    expect(text).toContain("JFIF");
    expect(text).toContain("ICC_PROFILE");
    expect([...stripped.slice(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
    expect(imageDimensions(stripped, "jpeg")).toEqual({ width: 4, height: 4 });
  });

  it("keeps only the orientation from EXIF so rotated photos still display upright", () => {
    const stripped = stripMetadata(jpeg(4, 4, 6), "jpeg");
    expect(jpegOrientation(stripped)).toBe(6);
    expect(hasObviousMetadata(stripped, "jpeg")).toBe(true); // the minimal Exif\0\0 marker
    const upright = stripMetadata(jpeg(4, 4, 1), "jpeg");
    expect(hasObviousMetadata(upright, "jpeg")).toBe(false);
    expect(jpegOrientation(upright)).toBe(1);
  });

  it("drops text and eXIf chunks from a PNG and keeps it decodable", () => {
    const original = png(2, 2);
    expect(hasObviousMetadata(original, "png")).toBe(true);
    const stripped = stripMetadata(original, "png");
    expect(hasObviousMetadata(stripped, "png")).toBe(false);
    expect(Buffer.from(stripped).toString("latin1")).toContain("IDAT");
    expect(stripped.slice(-12, -8)).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(imageDimensions(stripped, "png")).toEqual({ width: 2, height: 2 });
    expect(stripMetadata(png(2, 2, false), "png")).toEqual(png(2, 2, false));
  });

  it("drops comments and XMP from a GIF but keeps the loop extension and frames", () => {
    const stripped = stripMetadata(gif(2, 3), "gif");
    const text = Buffer.from(stripped).toString("latin1");
    expect(text).not.toContain("hello");
    expect(text).not.toContain("XMP DataXMP");
    expect(text).toContain("NETSCAPE2.0");
    expect(stripped[stripped.length - 1]).toBe(0x3b);
    expect(imageDimensions(stripped, "gif")).toEqual({ width: 2, height: 3 });
  });

  it("drops EXIF and XMP chunks from a WebP, clears the flags and fixes the RIFF size", () => {
    const stripped = stripMetadata(webp(300, 200), "webp");
    expect(hasObviousMetadata(stripped, "webp")).toBe(false);
    const riffSize = stripped[4] | (stripped[5] << 8) | (stripped[6] << 16) | (stripped[7] << 24);
    expect(riffSize).toBe(stripped.length - 8);
    // VP8X flags byte: alpha kept, EXIF/XMP cleared.
    expect(stripped[20]).toBe(0x10);
    expect(imageDimensions(stripped, "webp")).toEqual({ width: 300, height: 200 });
  });
});
