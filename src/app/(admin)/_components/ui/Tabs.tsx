"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export type Tab = { id: string; label: string; content: ReactNode };

// WAI-ARIA tabs: roving tabindex, arrow/Home/End keys, panels labelled by
// their tab. When `param` is given the selected tab is mirrored into the
// URL query (history.replaceState, no navigation) so it survives a reload.
export function Tabs({ tabs, initial, param }: { tabs: Tab[]; initial?: string; param?: string }) {
  const base = useId();
  const [selected, setSelected] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(id: string, focus = false) {
    setSelected(id);
    if (param && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(param, id);
      window.history.replaceState(window.history.state, "", url);
    }
    if (focus) refs.current[tabs.findIndex((t) => t.id === id)]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      select(tabs[i].id, true);
    };
    if (e.key === "ArrowRight") go(index === last ? 0 : index + 1);
    else if (e.key === "ArrowLeft") go(index === 0 ? last : index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
  }

  return (
    <div>
      <div className="adm-tabs" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            className="adm-tab"
            aria-selected={selected === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={selected === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={selected !== t.id} tabIndex={0}>
          {selected === t.id && t.content}
        </div>
      ))}
    </div>
  );
}
