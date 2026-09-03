// A small tolerant HTML scanner for the audit crawler. The site's own
// server-rendered markup is regular enough that a tag tokenizer is all that
// is needed; there is no HTML parser on the approved dependency list.

export type PageScan = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  h1s: string[];
  // src of every <img> without an alt attribute (alt="" is a valid decorative image).
  imagesMissingAlt: string[];
  // Every href as written, before resolution.
  links: string[];
};

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (name === "/") continue;
    out[name] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

const strip = (html: string): string => html.replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, "");

const text = (html: string): string => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export function scanHtml(html: string): PageScan {
  const body = strip(html);
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? text(titleMatch[1]) : null;
  let description: string | null = null;
  let canonical: string | null = null;
  let robots: string | null = null;
  const h1s: string[] = [];
  const imagesMissingAlt: string[] = [];
  const links: string[] = [];
  const langMatch = body.match(/<html\b([^>]*)>/i);
  const lang = langMatch ? attrs(langMatch[1]).lang ?? null : null;

  const tagRe = /<(meta|link|img|a|h1)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body))) {
    const tag = m[1].toLowerCase();
    const a = attrs(m[2]);
    if (tag === "meta") {
      const name = (a.name ?? "").toLowerCase();
      if (name === "description" && description === null) description = a.content ?? "";
      if (name === "robots" && robots === null) robots = a.content ?? "";
    } else if (tag === "link") {
      if ((a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") && canonical === null) canonical = a.href ?? "";
    } else if (tag === "img") {
      if (!("alt" in a)) imagesMissingAlt.push(a.src ?? "(no src)");
    } else if (tag === "a") {
      if (a.href !== undefined) links.push(a.href);
    } else if (tag === "h1") {
      const close = body.indexOf("</h1", m.index);
      h1s.push(close > 0 ? text(body.slice(m.index + m[0].length, close)) : "");
    }
  }
  return { title, description, canonical, robots, lang, h1s, imagesMissingAlt, links };
}

// Resolve an href against the crawled origin; null for anything that is not
// an internal page (other hosts, mailto, tel, javascript, fragments, files).
export function internalPath(href: string, origin: string, fromPath: string): string | null {
  const h = href.trim();
  if (!h || h.startsWith("#") || /^(mailto|tel|sms|javascript|data):/i.test(h)) return null;
  let url: URL;
  try {
    url = new URL(h, `${origin}${fromPath}`);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const path = url.pathname.replace(/\/{2,}/g, "/");
  if (/^\/(_next|api|admin|media)(\/|$)/.test(path)) return null;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|ico|pdf|mp4|webm|xml|txt|css|js|json|woff2?)$/i.test(path)) return null;
  const clean = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  // The query string never selects a different page on this site.
  return clean;
}
