"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

// Popover menu: closes on outside click and Escape (returning focus to the
// trigger), arrow keys move between items, Tab closes. Every listener is
// removed when the menu closes or unmounts.
export function Menu({
  label,
  trigger,
  children,
  align = "end",
  onOpenChange,
}: {
  label: string;
  // Receives the props to spread on the trigger button.
  trigger: (props: { "aria-haspopup": "true"; "aria-expanded": boolean; "aria-controls": string; onClick: () => void; id: string }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const triggerId = `${id}-trigger`;

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      onOpenChange?.(false);
      if (refocus) document.getElementById(triggerId)?.focus();
    },
    [onOpenChange, triggerId],
  );

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        close(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
        if (items.length === 0) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        let next = 0;
        if (e.key === "ArrowDown") next = i < 0 || i === items.length - 1 ? 0 : i + 1;
        else if (e.key === "ArrowUp") next = i <= 0 ? items.length - 1 : i - 1;
        else if (e.key === "End") next = items.length - 1;
        items[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Move focus to the first item so keyboard users land inside the menu.
    const first = wrap.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className="adm-menu-wrap" ref={wrap}>
      {trigger({
        id: triggerId,
        "aria-haspopup": "true",
        "aria-expanded": open,
        "aria-controls": `${id}-menu`,
        onClick: () => {
          const next = !open;
          setOpen(next);
          onOpenChange?.(next);
        },
      })}
      {open && (
        <div
          id={`${id}-menu`}
          className="adm-menu"
          role="menu"
          aria-label={label}
          style={align === "start" ? { insetInlineStart: 0, insetInlineEnd: "auto" } : undefined}
          onClick={(e) => {
            // Activating an item closes the menu.
            const el = (e.target as HTMLElement).closest('[role^="menuitem"]');
            if (el && !el.hasAttribute("data-keep-open")) close(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
