"use client";

import Link from "next/link";
import { apiPost } from "../api-client";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";

export function UserMenu({ csrf, name, email, role }: { csrf: string; name: string; email: string; role: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function signOut() {
    const res = await apiPost<{ redirectTo: string }>("/api/admin/auth/logout", {}, csrf);
    window.location.assign(res.data.ok ? res.data.redirectTo || "/admin/login" : "/admin/login");
  }

  return (
    <Menu
      label="Account menu"
      trigger={(props) => (
        <button type="button" className="adm-userbtn" aria-label={`Account: ${name}`} {...props}>
          <span className="adm-avatar" aria-hidden="true">{initials || "?"}</span>
          <span className="adm-userbtn-name">{name}</span>
          <Icon name="chevronDown" size={14} />
        </button>
      )}
    >
      <div className="adm-menu-head">
        <strong>{name}</strong>
        <span>{email}</span>
        <span> · {role}</span>
      </div>
      <Link href="/admin/account" role="menuitem" className="adm-menu-item">
        <Icon name="user" size={18} /> Account
      </Link>
      <Link href="/admin/account?tab=sessions" role="menuitem" className="adm-menu-item">
        <Icon name="shield" size={18} /> Sessions
      </Link>
      <button type="button" role="menuitem" className="adm-menu-item" onClick={signOut}>
        <Icon name="logout" size={18} /> Sign out
      </button>
    </Menu>
  );
}
