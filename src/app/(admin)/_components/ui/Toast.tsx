"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; title: string; body?: string };

const ToastContext = createContext<((t: Omit<ToastItem, "id">) => void) | null>(null);

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number) => {
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss],
  );

  const toast = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-4), { ...t, id }]);
      schedule(id);
    },
    [schedule],
  );

  // Clear every pending timer on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="adm-toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div
            key={t.id}
            className={`adm-toast adm-toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
            onMouseEnter={() => {
              const timer = timers.current.get(t.id);
              if (timer) clearTimeout(timer);
            }}
            onMouseLeave={() => schedule(t.id)}
          >
            <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={18} />
            <div>
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            <button type="button" className="adm-iconbtn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
