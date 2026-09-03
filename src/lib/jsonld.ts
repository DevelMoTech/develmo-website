// JSON for an inline <script type="application/ld+json">. JSON.stringify
// alone is not safe there: a value containing "</script>" ends the element
// and whatever follows runs as markup. Escaping the HTML-significant
// characters (and the two Unicode line separators, which break some
// parsers) as JSON unicode escapes keeps the document identical to
// crawlers, since it is still valid JSON with the same value, and inert to
// browsers.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(LINE_SEPARATOR, "\\u2028")
    .replaceAll(PARAGRAPH_SEPARATOR, "\\u2029");
}
