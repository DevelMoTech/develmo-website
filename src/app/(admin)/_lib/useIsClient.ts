"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false during server render and hydration, true afterwards. Lets a control
// whose value depends on the browser (time zone, storage) render an empty
// placeholder on the server without a hydration mismatch or an effect.
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
