"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { applyFormat, insertBlock, shortcutAction, type FormatAction } from "@/lib/markdown-edit";
import { Icon } from "./Icon";

// Formatting for a markdown textarea. The hook owns the one piece of state
// that matters: the selection to restore after React has rendered the new
// value, because the textarea is controlled and the cursor would otherwise
// land at the end. Toolbar clicks, Ctrl+B / Ctrl+I / Ctrl+K typed in the
// textarea, and inserting an image all go through the same hook, so they
// cannot disagree about where the cursor ends up.

type Edit = { value: string; start: number; end: number };

export function useMarkdownFormatting(textareaRef: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (next: string) => void) {
  const pending = useRef<Edit | null>(null);

  useEffect(() => {
    const p = pending.current;
    const ta = textareaRef.current;
    if (!p || !ta || p.value !== value) return;
    pending.current = null;
    ta.focus();
    ta.setSelectionRange(p.start, p.end);
  }, [value, textareaRef]);

  const selection = useCallback(() => {
    const ta = textareaRef.current;
    return { start: ta?.selectionStart ?? value.length, end: ta?.selectionEnd ?? value.length };
  }, [textareaRef, value]);

  const run = useCallback(
    (action: FormatAction) => {
      const { start, end } = selection();
      const edit = applyFormat(value, start, end, action);
      pending.current = edit;
      onChange(edit.value);
    },
    [selection, value, onChange],
  );

  const insert = useCallback(
    (block: string) => {
      const { start, end } = selection();
      const edit = insertBlock(value, start, end, block);
      pending.current = edit;
      onChange(edit.value);
    },
    [selection, value, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const action = shortcutAction(e);
      if (!action) return;
      e.preventDefault();
      run(action);
    },
    [run],
  );

  return { run, insert, onKeyDown };
}

// Glyph buttons rather than icons for bold, italic, heading and the rest:
// the glyph is the convention every editor uses, and each one still carries
// an accessible name and a 44px target.
type Item = { action: FormatAction; label: string; glyph?: string; icon?: "link" | "list"; shortcut?: string };

const ITEMS: Item[] = [
  { action: "bold", label: "Bold", glyph: "B", shortcut: "Ctrl+B" },
  { action: "italic", label: "Italic", glyph: "I", shortcut: "Ctrl+I" },
  { action: "heading", label: "Heading", glyph: "H" },
  { action: "quote", label: "Quote", glyph: "”" },
  { action: "ul", label: "Bulleted list", icon: "list" },
  { action: "ol", label: "Numbered list", glyph: "1." },
  { action: "link", label: "Link", icon: "link", shortcut: "Ctrl+K" },
  { action: "code", label: "Inline code", glyph: "<>" },
  { action: "codeblock", label: "Code block", glyph: "```" },
];

export function MarkdownToolbar({
  run,
  disabled,
  onInsertImage,
  label = "Formatting",
}: {
  run: (action: FormatAction) => void;
  disabled?: boolean;
  onInsertImage?: () => void;
  label?: string;
}) {
  return (
    <div className="adm-md-toolbar" role="toolbar" aria-label={label}>
      {ITEMS.map((item) => {
        const name = item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
        return (
          <button key={item.action} type="button" className={`adm-iconbtn adm-md-tool adm-md-tool-${item.action}`} aria-label={name} title={name} disabled={disabled} onClick={() => run(item.action)}>
            {item.icon ? <Icon name={item.icon} size={18} /> : <span aria-hidden="true">{item.glyph}</span>}
          </button>
        );
      })}
      {onInsertImage && (
        <button type="button" className="adm-iconbtn adm-md-tool" aria-label="Insert image" title="Insert image" disabled={disabled} onClick={onInsertImage}>
          <Icon name="image" size={18} />
        </button>
      )}
    </div>
  );
}
