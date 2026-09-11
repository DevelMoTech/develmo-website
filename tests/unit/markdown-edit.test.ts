import { describe, expect, it } from "vitest";
import { applyFormat, insertBlock, shortcutAction } from "@/lib/markdown-edit";

// The toolbar transforms, checked as text in and text out with the
// selection that comes back, because a toolbar that loses the cursor is
// worse than no toolbar.

const sel = (value: string, marker = "|") => {
  const a = value.indexOf(marker);
  const b = value.indexOf(marker, a + 1);
  const clean = value.replace(new RegExp(`\\${marker}`, "g"), "");
  return { value: clean, start: a, end: b === -1 ? a : b - 1 };
};

describe("inline formatting", () => {
  it("wraps a selection in bold and keeps the text selected", () => {
    const s = sel("make |this| bold");
    const r = applyFormat(s.value, s.start, s.end, "bold");
    expect(r.value).toBe("make **this** bold");
    expect(r.value.slice(r.start, r.end)).toBe("this");
  });

  it("inserts a selected placeholder when nothing is selected", () => {
    const s = sel("type |here");
    const r = applyFormat(s.value, s.start, s.end, "italic");
    expect(r.value).toBe("type *italic text*here");
    expect(r.value.slice(r.start, r.end)).toBe("italic text");
  });

  it("toggles bold off when the selection is already wrapped, from inside or outside the markers", () => {
    const inside = sel("make **|this|** bold");
    expect(applyFormat(inside.value, inside.start, inside.end, "bold").value).toBe("make this bold");
    const outside = sel("make |**this**| bold");
    const r = applyFormat(outside.value, outside.start, outside.end, "bold");
    expect(r.value).toBe("make this bold");
    expect(r.value.slice(r.start, r.end)).toBe("this");
  });

  it("does not mistake the inner asterisk of bold for italic", () => {
    const s = sel("make **|this|** bold");
    expect(applyFormat(s.value, s.start, s.end, "italic").value).toBe("make ***this*** bold");
  });

  it("wraps inline code with backticks", () => {
    const s = sel("call |fn()| now");
    expect(applyFormat(s.value, s.start, s.end, "code").value).toBe("call `fn()` now");
  });
});

describe("line formatting", () => {
  it("turns the current line into a heading and back", () => {
    const s = sel("intro\nA sec|tion\nmore");
    const r = applyFormat(s.value, s.start, s.end, "heading");
    expect(r.value).toBe("intro\n## A section\nmore");
    const back = applyFormat(r.value, r.start, r.end, "heading");
    expect(back.value).toBe("intro\nA section\nmore");
  });

  it("prefixes every selected line as a bulleted list, skipping blank lines, and selects the block", () => {
    const s = sel("|one\ntwo\n\nthree|");
    const r = applyFormat(s.value, s.start, s.end, "ul");
    expect(r.value).toBe("- one\n- two\n\n- three");
    expect(r.value.slice(r.start, r.end)).toBe("- one\n- two\n\n- three");
  });

  it("numbers selected lines in order and renumbers lines that already have numbers", () => {
    const s = sel("|first\n7. second\nthird|");
    expect(applyFormat(s.value, s.start, s.end, "ol").value).toBe("1. first\n2. second\n3. third");
  });

  it("removes list markers when every selected line already has one", () => {
    const s = sel("|- a\n- b|");
    expect(applyFormat(s.value, s.start, s.end, "ul").value).toBe("a\nb");
    const o = sel("|1. a\n2. b|");
    expect(applyFormat(o.value, o.start, o.end, "ol").value).toBe("a\nb");
  });

  it("quotes lines and unquotes them", () => {
    const s = sel("|said this|");
    const r = applyFormat(s.value, s.start, s.end, "quote");
    expect(r.value).toBe("> said this");
    expect(applyFormat(r.value, r.start, r.end, "quote").value).toBe("said this");
  });

  it("fences selected lines as a code block and selects the code, with a placeholder when empty", () => {
    const s = sel("|let x = 1;\nlet y = 2;|");
    const r = applyFormat(s.value, s.start, s.end, "codeblock");
    expect(r.value).toBe("```\nlet x = 1;\nlet y = 2;\n```");
    expect(r.value.slice(r.start, r.end)).toBe("let x = 1;\nlet y = 2;");
    const empty = applyFormat("", 0, 0, "codeblock");
    expect(empty.value).toBe("```\ncode\n```");
    expect(empty.value.slice(empty.start, empty.end)).toBe("code");
  });
});

describe("links", () => {
  it("makes selected words the link text and selects the url placeholder", () => {
    const s = sel("see |our services| today");
    const r = applyFormat(s.value, s.start, s.end, "link");
    expect(r.value).toBe("see [our services](url) today");
    expect(r.value.slice(r.start, r.end)).toBe("url");
  });

  it("makes a selected address the target and selects the text placeholder", () => {
    const s = sel("go to |https://develmo.com/jobs|");
    const r = applyFormat(s.value, s.start, s.end, "link");
    expect(r.value).toBe("go to [link text](https://develmo.com/jobs)");
    expect(r.value.slice(r.start, r.end)).toBe("link text");
  });

  it("inserts a full placeholder link when nothing is selected", () => {
    const r = applyFormat("", 0, 0, "link");
    expect(r.value).toBe("[link text](url)");
    expect(r.value.slice(r.start, r.end)).toBe("link text");
  });
});

describe("insertBlock", () => {
  it("puts an image on its own paragraph wherever the cursor is", () => {
    const img = "![A photo](/media/abc.png)";
    expect(insertBlock("", 0, 0, img).value).toBe(`${img}\n\n`);
    expect(insertBlock("para one", 8, 8, img).value).toBe(`para one\n\n${img}\n\n`);
    const mid = insertBlock("one\n\ntwo", 5, 5, img);
    expect(mid.value).toBe(`one\n\n${img}\n\ntwo`);
    expect(mid.start).toBe(mid.end);
    expect(mid.value.slice(mid.start)).toBe("two");
  });

  it("replaces a selection rather than keeping it", () => {
    expect(insertBlock("keep DROP keep", 5, 9, "X").value).toBe("keep \n\nX\n\n keep");
  });
});

describe("shortcuts", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  it("maps ctrl or cmd with b, i and k, and nothing else", () => {
    expect(shortcutAction(key("b", { ctrlKey: true }))).toBe("bold");
    expect(shortcutAction(key("I", { metaKey: true }))).toBe("italic");
    expect(shortcutAction(key("k", { ctrlKey: true }))).toBe("link");
    expect(shortcutAction(key("b"))).toBeNull();
    expect(shortcutAction(key("b", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutAction(key("s", { ctrlKey: true }))).toBeNull();
  });
});
