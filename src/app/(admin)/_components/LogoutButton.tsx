"use client";

import { apiPost } from "./api-client";

export function LogoutButton({ csrf, label = "Sign out", className }: { csrf: string; label?: string; className?: string }) {
  async function onClick() {
    const res = await apiPost<{ redirectTo: string }>("/api/admin/auth/logout", {}, csrf);
    window.location.assign(res.data.ok ? res.data.redirectTo || "/admin/login" : "/admin/login");
  }
  return (
    <button type="button" className={className ?? "adm-btn adm-btn-ghost adm-btn-sm"} onClick={onClick}>
      {label}
    </button>
  );
}
