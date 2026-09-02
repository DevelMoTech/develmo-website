"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { NavGroup } from "../../_lib/nav";

const CHORD_MS = 1200;

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// Keyboard shortcuts (brief §6.4): "/" focuses search, "g" then a letter
// jumps to a section, Escape blurs the search. Overlays (menus, modals, the
// drawer) handle their own Escape. Ignored while typing in a field.
export function Shortcuts({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  useEffect(() => {
    const chords = new Map<string, string>();
    for (const g of groups) for (const i of g.items) if (i.chord) chords.set(i.chord, i.href);
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inEditable(e.target)) {
        if (e.key === "Escape" && e.target instanceof HTMLElement) e.target.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("adm-search")?.focus();
        return;
      }
      const now = Date.now();
      if (pendingG && now - pendingG < CHORD_MS) {
        const href = chords.get(e.key.toLowerCase());
        pendingG = 0;
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (e.key === "g") pendingG = now;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [groups, router]);
  return null;
}
