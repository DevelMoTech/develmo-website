// The text transforms behind the post editor's formatting toolbar. Pure
// functions over (value, selection) so they can be tested without a DOM and
// behave identically for a click and a keyboard shortcut.
//
// Every action returns the new text and the selection to restore, so the
// caller can keep the cursor where a person expects it: still on the text
// they were working with, or on a placeholder they can type over.

export type FormatAction = "bold" | "italic" | "code" | "heading" | "quote" | "ul" | "ol" | "link" | "codeblock";

export type Edit = { value: string; start: number; end: number };

const INLINE: Record<"bold" | "italic" | "code", { marker: string; placeholder: string }> = {
  bold: { marker: "**", placeholder: "bold text" },
  italic: { marker: "*", placeholder: "italic text" },
  code: { marker: "`", placeholder: "code" },
};

const LINE: Record<"heading" | "quote" | "ul", { prefix: string; strip: RegExp }> = {
  heading: { prefix: "## ", strip: /^#{1,6}\s+/ },
  quote: { prefix: "> ", strip: /^>\s?/ },
  ul: { prefix: "- ", strip: /^[-*+]\s+/ },
};

// Bold and italic share a marker character, so "already wrapped" has to look
// at the exact marker, not just any asterisks.
function wrappedBy(value: string, start: number, end: number, marker: string): boolean {
  const before = value.slice(Math.max(0, start - marker.length), start);
  const after = value.slice(end, end + marker.length);
  if (before !== marker || after !== marker) return false;
  if (marker === "*") {
    // Not the inner asterisk of a ** pair.
    const beforeBefore = value.slice(Math.max(0, start - 2), start - 1);
    const afterAfter = value.slice(end + 1, end + 2);
    if (beforeBefore === "*" && afterAfter === "*") return false;
  }
  return true;
}

function inline(value: string, start: number, end: number, action: "bold" | "italic" | "code"): Edit {
  const { marker, placeholder } = INLINE[action];
  const selected = value.slice(start, end);
  if (selected.length === 0) {
    const insert = `${marker}${placeholder}${marker}`;
    return { value: value.slice(0, start) + insert + value.slice(end), start: start + marker.length, end: start + marker.length + placeholder.length };
  }
  if (wrappedBy(value, start, end, marker)) {
    // Toggle off: remove the markers around the selection.
    return { value: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length), start: start - marker.length, end: end - marker.length };
  }
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    // The markers were selected along with the text: toggle off as well.
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + marker.length, end: end + marker.length };
}

// The range of whole lines the selection touches.
function lineRange(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", Math.max(end, start));
  const to = nl === -1 ? value.length : nl;
  return { from, to };
}

function lines(value: string, start: number, end: number, transform: (line: string, index: number) => string): Edit {
  const { from, to } = lineRange(value, start, end);
  const block = value.slice(from, to);
  const next = block.split("\n").map(transform).join("\n");
  return { value: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
}

function prefixLines(value: string, start: number, end: number, action: "heading" | "quote" | "ul"): Edit {
  const { prefix, strip } = LINE[action];
  const { from, to } = lineRange(value, start, end);
  const all = value.slice(from, to).split("\n");
  const every = all.every((l) => l.trim().length === 0 || strip.test(l));
  return lines(value, start, end, (l) => {
    if (every) return l.replace(strip, "");
    if (l.trim().length === 0) return l;
    return strip.test(l) ? l : prefix + l;
  });
}

function orderedList(value: string, start: number, end: number): Edit {
  const { from, to } = lineRange(value, start, end);
  const all = value.slice(from, to).split("\n");
  const every = all.every((l) => l.trim().length === 0 || /^\d+\.\s+/.test(l));
  let n = 0;
  return lines(value, start, end, (l) => {
    if (every) return l.replace(/^\d+\.\s+/, "");
    if (l.trim().length === 0) return l;
    n += 1;
    return /^\d+\.\s+/.test(l) ? l.replace(/^\d+\./, `${n}.`) : `${n}. ${l}`;
  });
}

function link(value: string, start: number, end: number): Edit {
  const selected = value.slice(start, end);
  if (selected.length === 0) {
    const text = "link text";
    const insert = `[${text}](url)`;
    return { value: value.slice(0, start) + insert + value.slice(end), start: start + 1, end: start + 1 + text.length };
  }
  // A selected address becomes the link's target; anything else its text.
  if (/^https?:\/\/\S+$/i.test(selected)) {
    const text = "link text";
    const insert = `[${text}](${selected})`;
    return { value: value.slice(0, start) + insert + value.slice(end), start: start + 1, end: start + 1 + text.length };
  }
  const insert = `[${selected}](url)`;
  const urlAt = start + insert.length - 4;
  return { value: value.slice(0, start) + insert + value.slice(end), start: urlAt, end: urlAt + 3 };
}

function codeBlock(value: string, start: number, end: number): Edit {
  const { from, to } = lineRange(value, start, end);
  const block = value.slice(from, to);
  const fenced = block.startsWith("```") && block.endsWith("```");
  if (fenced) {
    const inner = block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
    return { value: value.slice(0, from) + inner + value.slice(to), start: from, end: from + inner.length };
  }
  const body = block.length > 0 ? block : "code";
  const next = "```\n" + body + "\n```";
  return { value: value.slice(0, from) + next + value.slice(to), start: from + 4, end: from + 4 + body.length };
}

export function applyFormat(value: string, start: number, end: number, action: FormatAction): Edit {
  const s = Math.max(0, Math.min(start, end, value.length));
  const e = Math.max(s, Math.min(Math.max(start, end), value.length));
  switch (action) {
    case "bold":
    case "italic":
    case "code":
      return inline(value, s, e, action);
    case "heading":
    case "quote":
    case "ul":
      return prefixLines(value, s, e, action);
    case "ol":
      return orderedList(value, s, e);
    case "link":
      return link(value, s, e);
    case "codeblock":
      return codeBlock(value, s, e);
  }
}

// Inserts a block (an image, say) on its own paragraph at the cursor.
export function insertBlock(value: string, start: number, end: number, block: string): Edit {
  const s = Math.max(0, Math.min(start, end, value.length));
  const e = Math.max(s, Math.min(Math.max(start, end), value.length));
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.length === 0 || after.startsWith("\n\n") ? "\n\n" : after.startsWith("\n") ? "\n" : "\n\n";
  const insert = lead + block + trail;
  const next = before + insert + after;
  const at = before.length + insert.length;
  return { value: next, start: at, end: at };
}

// The keyboard shortcuts the toolbar honours inside the textarea.
export function shortcutAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): FormatAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "b") return "bold";
  if (k === "i") return "italic";
  if (k === "k") return "link";
  return null;
}
