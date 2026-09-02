"use client";

import Link from "next/link";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";

export type NotificationItem = { id: string; title: string; detail: string; when: string; href: string };

// Recent activity that needs eyes: new submissions and security events from
// the last 24 hours, rendered server-side and handed in as props.
export function Notifications({ items, unread }: { items: NotificationItem[]; unread: number }) {
  return (
    <Menu
      label="Notifications"
      trigger={(props) => (
        <button type="button" className="adm-iconbtn" aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"} title="Notifications" {...props}>
          <Icon name="bell" />
          {unread > 0 && <span className="adm-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        </button>
      )}
    >
      <div className="adm-menu-head">
        <strong>Last 24 hours</strong>
        <span>{unread === 0 ? "Nothing new" : `${unread} item${unread === 1 ? "" : "s"} to look at`}</span>
      </div>
      {items.length === 0 && <div className="adm-menu-empty">No new submissions or security events.</div>}
      {items.map((n) => (
        <Link key={n.id} href={n.href} role="menuitem" className="adm-menu-item">
          <span className="adm-notif">
            <strong>{n.title}</strong>
            <span>{n.detail} · {n.when}</span>
          </span>
        </Link>
      ))}
      <Link href="/admin/audit" role="menuitem" className="adm-menu-item">
        <Icon name="audit" size={18} /> Open the audit log
      </Link>
    </Menu>
  );
}
