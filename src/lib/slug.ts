// URL slug helpers, pure and unit tested. A slug is lowercase ASCII words
// joined by single hyphens: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.

export const SLUG_MAX = 120;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string, max = SLUG_MAX): string {
  const base = input
    .normalize("NFKD")
    // Strip combining marks left by NFKD (accents).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Common typographic ligatures and symbols that NFKD does not split.
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/['’"“”`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  // Cut on a word boundary so the tail is never a half word.
  const cut = base.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

export function isValidSlug(v: string): boolean {
  return v.length > 0 && v.length <= SLUG_MAX && SLUG_RE.test(v);
}

// "my-post" -> "my-post-2", "my-post-2" -> "my-post-3". Used when a
// requested slug is taken and the caller wants a free one to suggest.
export function nextSlug(taken: string): string {
  const m = taken.match(/^(.*?)-(\d+)$/);
  if (m) return `${m[1]}-${Number(m[2]) + 1}`;
  return `${taken}-2`;
}

// Plain-English reading time from markdown source: strip syntax, count
// words, 200 words per minute, never below one minute for non-empty text.
export function readingTimeMinutes(markdown: string, wpm = 200): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / wpm));
}
