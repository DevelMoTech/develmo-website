"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { breadcrumbsFor, type NavGroup } from "../../_lib/nav";
import { useLocalStorageValue } from "../../_lib/useLocalStorage";
import { Icon } from "../ui/Icon";
import { GlobalSearch } from "./GlobalSearch";
import { Shortcuts } from "./Shortcuts";

const COLLAPSE_KEY = "dm_admin_sidebar";

// The console frame: sidebar (collapsible to icons on desktop, off-canvas
// drawer below 1024px), top bar, content. The drawer closes on link click,
// outside click (backdrop), Escape and route change; every listener is
// removed on close or unmount.
export function Shell({
  groups,
  tools,
  children,
}: {
  groups: NavGroup[];
  // Server-rendered top bar tools (theme, notifications, user menu).
  tools: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsedPref, setCollapsedPref] = useLocalStorageValue(COLLAPSE_KEY, "expanded");
  const collapsed = collapsedPref === "collapsed";
  // The drawer is open only for the path it was opened on, so a route change
  // closes it by derivation rather than by an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === pathname;
  const menuBtn = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback((refocus = false) => {
    setDrawerPath(null);
    if (refocus) menuBtn.current?.focus();
  }, []);

  // While open: Escape closes and returns focus to the hamburger; focus moves
  // into the drawer so keyboard users are not left behind the backdrop.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer(true);
    };
    document.addEventListener("keydown", onKey);
    document.querySelector<HTMLElement>("#adm-sidebar .adm-side-close")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, closeDrawer]);

  function toggleCollapsed() {
    setCollapsedPref(collapsed ? "expanded" : "collapsed");
  }

  const crumbs = breadcrumbsFor(pathname);
  const isCurrent = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className="adm-shell" data-collapsed={collapsed} data-drawer={drawer ? "open" : "closed"}>
      <Shortcuts groups={groups} />
      <a className="adm-skip" href="#adm-main">Skip to content</a>

      <aside className="adm-side" id="adm-sidebar" aria-label="Console navigation">
        <div className="adm-side-head">
          <Link href="/admin" className="adm-side-brand" onClick={() => closeDrawer()}>
            <img src="/develmo-logo-white.png" alt="" />
            <span>DevelMo Admin</span>
          </Link>
          <button type="button" className="adm-iconbtn adm-side-close" aria-label="Close menu" onClick={() => closeDrawer(true)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="adm-side-nav" aria-label="Sections">
          {groups.map((g) => (
            <div className="adm-side-group" key={g.label}>
              <div className="adm-side-group-label" aria-hidden="true">{g.label}</div>
              <ul>
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="adm-side-link"
                      aria-current={isCurrent(item.href) ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      onClick={() => closeDrawer()}
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="adm-side-foot">
          <button type="button" className="adm-side-collapse" onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand" : "Collapse"}>
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} />
            <span>Collapse</span>
          </button>
        </div>
      </aside>
      <button type="button" className="adm-backdrop" aria-label="Close menu" tabIndex={drawer ? 0 : -1} onClick={() => closeDrawer(true)} />

      <div className="adm-frame">
        <header className="adm-top">
          <button
            ref={menuBtn}
            type="button"
            className="adm-iconbtn adm-top-menu"
            aria-label="Open menu"
            aria-controls="adm-sidebar"
            aria-expanded={drawer}
            onClick={() => setDrawerPath(pathname)}
          >
            <Icon name="menu" />
          </button>
          <nav className="adm-crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={c.href}>
                    {i > 0 && <Icon name="chevronRight" size={14} />}
                    {last ? <span aria-current="page">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="adm-top-tools">
            <GlobalSearch />
            {tools}
          </div>
        </header>
        <main className="adm-main" id="adm-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
