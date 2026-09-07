"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../ui/Icon";

type Hit = { group: string; label: string; detail?: string; href: string };

// Top bar search: debounced query to /api/admin/search, results as a listbox
// with arrow keys and Enter. "/" focuses it from anywhere (Shortcuts).
export function GlobalSearch() {
  const id = useId();
  const router = useRouter();
  const [q, setQ] = useState("");
  // Results are keyed by the term they answer, so a cleared or changed query
  // hides stale hits without an extra state write.
  const [result, setResult] = useState<{ term: string; hits: Hit[] } | null>(null);
  const term = q.trim();
  const hits: Hit[] | null = result && result.term === term ? result.hits : null;
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!term) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, credentials: "same-origin" });
        const data = (await res.json()) as { ok: boolean; hits?: Hit[] };
        setResult({ term, hits: data.ok ? (data.hits ?? []) : [] });
        setActive(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResult({ term, hits: [] });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function go(hit: Hit) {
    setOpen(false);
    setMobileOpen(false);
    setQ("");
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits || hits.length === 0) {
      if (e.key === "Escape") {
        setOpen(false);
        setMobileOpen(false);
        input.current?.blur();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
      input.current?.blur();
    }
  }

  const groups = hits ? [...new Set(hits.map((h) => h.group))] : [];
  const listId = `${id}-list`;

  return (
    <div className={`adm-search${mobileOpen ? " adm-search-open" : ""}`} ref={wrap} role="search" aria-label="Search the console">
      <Icon name="search" size={18} />
      <label className="adm-sr" htmlFor="adm-search">Search the console</label>
      <input
        ref={input}
        id="adm-search"
        className="adm-search-input"
        type="search"
        placeholder="Search"
        autoComplete="off"
        value={q}
        role="combobox"
        aria-expanded={open && hits !== null}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${id}-hit-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd aria-hidden="true">/</kbd>
      <button
        type="button"
        className="adm-iconbtn adm-search-toggle"
        aria-label="Open search"
        onClick={() => {
          setMobileOpen(true);
          setTimeout(() => input.current?.focus(), 0);
        }}
      >
        <Icon name="search" />
      </button>
      {open && hits !== null && (
        <div className="adm-search-results" id={listId} role="listbox" aria-label="Search results">
          {hits.length === 0 && <div className="adm-search-empty">No matches for “{q.trim()}”.</div>}
          {groups.map((g) => (
            <div key={g}>
              <div className="adm-search-group">{g}</div>
              {hits.map((h, i) =>
                h.group === g ? (
                  <a
                    key={`${h.href}-${i}`}
                    id={`${id}-hit-${i}`}
                    role="option"
                    aria-selected={active === i}
                    className="adm-search-item"
                    href={h.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(h);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span>{h.label}</span>
                    {h.detail && <small>{h.detail}</small>}
                  </a>
                ) : null,
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
