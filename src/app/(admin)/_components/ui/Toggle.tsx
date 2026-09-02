"use client";

import type { ReactNode } from "react";

// Accessible switch: a button with role="switch", operable by keyboard.
export function Toggle({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className="adm-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="adm-switch-track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
