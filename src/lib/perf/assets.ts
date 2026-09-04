// Asset weight report (brief §3.8). Pure: the cost maths and the classing
// live here so the console and the unit tests agree, and the server module
// does the filesystem and network work.

export type AssetKind = "video" | "image" | "font" | "document" | "other";

export type AssetRow = {
  // Public URL path, e.g. "/hero-1.mp4".
  path: string;
  kind: AssetKind;
  contentType: string;
  // Bytes on disk.
  bytes: number;
  // Bytes actually sent, from the live response, when it could be measured.
  transferBytes: number | null;
  // Whether the response was compressed on the wire.
  encoding: string | null;
  // Public routes whose source references this asset.
  routes: string[];
  source: "public" | "blob";
};

const EXT_KIND: Record<string, AssetKind> = {
  mp4: "video",
  webm: "video",
  mov: "video",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  svg: "image",
  ico: "image",
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  pdf: "document",
  txt: "document",
  xml: "document",
  json: "document",
};

const EXT_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  txt: "text/plain",
  xml: "application/xml",
  json: "application/json",
};

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

export function kindOf(path: string): AssetKind {
  return EXT_KIND[extensionOf(path)] ?? "other";
}

export function contentTypeOf(path: string): string {
  return EXT_TYPE[extensionOf(path)] ?? "application/octet-stream";
}

// The three hero clips the handoff calls out as the heaviest thing a mobile
// visitor can be asked to download (HANDOFF §9.1).
export const FLAGGED = ["/hero-1.mp4", "/hero-2.mp4", "/hero-3.mp4"];

export function isFlagged(path: string): boolean {
  return FLAGGED.includes(path);
}

// Mobile data cost. Published UK pay-as-you-go rates cluster around
// £0.05 per MB out of bundle; roaming is an order of magnitude worse. The
// figure is a stated assumption shown next to the number, not a claim about
// any particular visitor's tariff.
export const COST_PER_MB_GBP = 0.05;
export const ROAMING_COST_PER_MB_GBP = 0.5;

export type DataCost = {
  megabytes: number;
  gbp: number;
  roamingGbp: number;
  // Seconds to download on a slow 4G link (1.6 Mbps), the profile Lighthouse
  // throttles to.
  secondsOnSlow4g: number;
};

const SLOW_4G_BYTES_PER_SECOND = (1.6 * 1_000_000) / 8;

export function dataCost(bytes: number): DataCost {
  const megabytes = bytes / (1024 * 1024);
  return {
    megabytes,
    gbp: megabytes * COST_PER_MB_GBP,
    roamingGbp: megabytes * ROAMING_COST_PER_MB_GBP,
    secondsOnSlow4g: bytes / SLOW_4G_BYTES_PER_SECOND,
  };
}

export function formatCost(gbp: number): string {
  return gbp < 0.01 ? "under 1p" : `£${gbp.toFixed(2)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return "under a second";
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} minute${m === 1 ? "" : "s"} ${s} seconds`;
}

// Everything a visitor is asked for, so the totals can be split by kind.
export function totalsByKind(rows: AssetRow[]): { kind: AssetKind; bytes: number; count: number }[] {
  const map = new Map<AssetKind, { bytes: number; count: number }>();
  for (const r of rows) {
    const cur = map.get(r.kind) ?? { bytes: 0, count: 0 };
    cur.bytes += r.transferBytes ?? r.bytes;
    cur.count += 1;
    map.set(r.kind, cur);
  }
  return [...map.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.bytes - a.bytes);
}
