"use client";

import type { ReactNode } from "react";
import { useLocalStorageValue } from "../../_lib/useLocalStorage";
import { Toggle } from "./Toggle";

// Client wrapper around a server-rendered table: remembers the row density
// per browser and exposes it as a data attribute for the CSS.
export function TableFrame({ children }: { children: ReactNode }) {
  const [density, setDensity] = useLocalStorageValue("dm_admin_density", "comfortable");
  const compact = density === "compact";
  return (
    <div data-density={compact ? "compact" : "comfortable"}>
      <div className="adm-actions" style={{ justifyContent: "flex-end", marginBlockEnd: 8 }}>
        <Toggle id="table-density" checked={compact} onChange={(next) => setDensity(next ? "compact" : "comfortable")} label="Compact rows" />
      </div>
      {children}
    </div>
  );
}
