// Locale leak detection (brief §3.9, HANDOFF §5.2 and §7).
//
// The gotcha this exists for: React serialises component props, including key
// props, into the RSC flight payload, which is emitted inside <script> tags.
// The English source string is therefore present in the raw HTML of a
// correctly translated page. A naive "does the English appear anywhere"
// check false-positives on every page. Stripping <head> and every <script>
// block leaves what the visitor actually sees, which is what to test.
//
// Pure module: the detector takes HTML and a dictionary, so the unit tests
// drive it with literals and the runner does the fetching.

import { allKeys, DECORATIVE_ENGLISH, fileValue, isDecorative } from "./keys";

export type Leak = { key: string; context: string };
export type LeakResult = {
  route: string;
  locale: string;
  status: number;
  lang: string | null;
  dir: string | null;
  leaks: Leak[];
  // Characters of visible text examined, so a page that failed to render is
  // not reported as clean.
  examined: number;
};

// Everything the visitor never sees, plus the regions marked as content.
//
// `data-i18n="content"` marks text that comes from the content itself and
// stays English by design (HANDOFF §8: blog and knowledge base titles,
// excerpts, categories and authors are content, not chrome). Marking the
// element is better than allowlisting the words, because the same words used
// as chrome elsewhere still have to be translated and would still be caught.
export function stripInvisible(html: string): string {
  return html
    .replace(/<([a-z0-9]+)\b[^>]*\bdata-i18n="content"[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

// Attribute values are not visible text either, and several of them legitimately
// carry English (href, class, id, aria-label on icon-only controls). Visible
// text is what is left between the tags.
export function visibleText(html: string): string {
  return stripInvisible(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A key counts as leaked only when it appears as a whole phrase, so "Other"
// does not match inside "Otherwise" and a short key cannot fire on a
// coincidence. Keys under this length are too common to test safely.
const MIN_KEY_LENGTH = 6;

export function findLeaks(html: string, locale: string, options: { keys?: { key: string }[]; translated?: (locale: string, key: string) => string | undefined } = {}): Leak[] {
  const text = visibleText(html);
  const keys = options.keys ?? allKeys();
  const translated = options.translated ?? fileValue;
  const leaks: Leak[] = [];
  for (const { key } of keys) {
    if (key.length < MIN_KEY_LENGTH || isDecorative(key)) continue;
    // Only a string this locale claims to translate can leak. A key with no
    // translation renders in English by design and is a coverage gap, not a
    // leak; the missing keys view is where that belongs.
    const value = translated(locale, key);
    if (typeof value !== "string" || value.trim() === "") continue;
    // A translation identical to the English source is not a leak either.
    if (value === key) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(key)}([^\\p{L}\\p{N}]|$)`, "u");
    const match = re.exec(text);
    if (!match) continue;
    const at = match.index;
    leaks.push({ key, context: text.slice(Math.max(0, at - 40), at + key.length + 40).trim() });
  }
  return leaks;
}

export function readLangDir(html: string): { lang: string | null; dir: string | null } {
  const tag = html.match(/<html\b([^>]*)>/i)?.[1] ?? "";
  return {
    lang: tag.match(/\blang\s*=\s*"([^"]*)"/i)?.[1] ?? null,
    dir: tag.match(/\bdir\s*=\s*"([^"]*)"/i)?.[1] ?? null,
  };
}

export { DECORATIVE_ENGLISH };
