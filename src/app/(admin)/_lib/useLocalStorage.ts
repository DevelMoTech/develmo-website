"use client";

import { useCallback, useSyncExternalStore } from "react";

// localStorage-backed string preference without setState-in-effect: React
// reads the server snapshot during hydration and the client value after, and
// same-tab writers notify subscribers directly (the storage event only fires
// for other tabs).

const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

export function useLocalStorageValue(key: string, fallback: string): [string, (next: string) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set?.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {}
      notify(key);
    },
    [key],
  );
  return [value, set];
}
