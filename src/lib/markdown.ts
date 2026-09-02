import { createElement, Fragment, type ReactNode } from "react";
import { remark } from "remark";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root, RootContent } from "hast";
import type { Schema } from "hast-util-sanitize";

// Markdown for post bodies (brief §3.3): parsed by remark, converted to HTML
// by remark-rehype, then run through rehype-sanitize with the default
// schema plus `language-*` classes on code blocks. Nothing here uses
// dangerouslySetInnerHTML on unsanitized input:
//   - the public page renders the sanitized hast tree straight to React
//     elements (no HTML string at all, so React escapes every text node);
//   - the editor's live preview receives a sanitized HTML string.
// CommonMark only (no GFM tables or task lists): remark-gfm is not on the
// approved dependency list.

const schema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^language-[a-z0-9-]+$/]],
    img: [...(defaultSchema.attributes?.img ?? []), "alt", "width", "height", "title"],
  },
};

const toHast = remark().use(remarkRehype).use(rehypeSanitize, schema);
const toHtml = remark().use(remarkRehype).use(rehypeSanitize, schema).use(rehypeStringify);

export async function markdownToHast(markdown: string): Promise<Root> {
  const tree = await toHast.run(toHast.parse(markdown));
  return tree as Root;
}

// Sanitized HTML string, for the editor preview only.
export async function markdownToHtml(markdown: string): Promise<string> {
  return String(await toHtml.process(markdown));
}

// Containers whose whitespace-only text children carry no meaning. Dropping
// them keeps the rendered HTML free of stray "\n" nodes between blocks, so a
// plain-paragraph post renders exactly <p>…</p><p>…</p>, byte for byte what
// the site emitted before markdown support.
const BLOCK_PARENTS = new Set(["root", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "dl", "details", "figure", "section", "div"]);

function properties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "className" && Array.isArray(value)) out.className = value.join(" ");
    else if (Array.isArray(value)) out[key] = value.join(" ");
    else out[key] = value === true ? true : value;
  }
  return out;
}

function renderNode(node: RootContent, key: number, parentTag: string): ReactNode {
  if (node.type === "text") {
    if (BLOCK_PARENTS.has(parentTag) && node.value.trim() === "") return null;
    return node.value;
  }
  if (node.type !== "element") return null;
  const children = node.children.map((c, i) => renderNode(c, i, node.tagName)).filter((c) => c !== null);
  const props: Record<string, unknown> = { ...properties(node.properties ?? {}), key };
  // Body images load lazily; the hero above the article is the only eager one.
  if (node.tagName === "img") {
    props.loading = "lazy";
    props.decoding = "async";
  }
  // Void elements must not receive children.
  if (node.tagName === "img" || node.tagName === "br" || node.tagName === "hr" || node.tagName === "input" || node.tagName === "source") {
    return createElement(node.tagName, props);
  }
  return createElement(node.tagName, props, ...children);
}

// Sanitized hast tree -> React elements. Text stays text, so React escapes
// it exactly as it would any JSX string.
export function hastToReact(tree: Root): ReactNode {
  const nodes = tree.children.map((c, i) => renderNode(c, i, "root")).filter((c) => c !== null);
  return createElement(Fragment, null, ...nodes);
}

export async function renderMarkdown(markdown: string): Promise<ReactNode> {
  return hastToReact(await markdownToHast(markdown));
}
