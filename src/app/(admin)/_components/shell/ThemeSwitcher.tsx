"use client";

import { useState } from "react";
import { THEMES, THEME_STORAGE_KEY, type ThemeId } from "../../_lib/theme";
import { apiPost, describeError } from "../api-client";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { useToast } from "../ui/Toast";

function applyTheme(theme: ThemeId) {
  const root = document.querySelector<HTMLElement>(".adm-root");
  if (root) root.setAttribute("data-admin-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

export function ThemeSwitcher({ csrf, initial }: { csrf: string; initial: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(initial);
  const toast = useToast();

  async function choose(next: ThemeId) {
    if (next === theme) return;
    const previous = theme;
    // Optimistic: switch instantly, no reload; roll back if the save fails.
    setTheme(next);
    applyTheme(next);
    const res = await apiPost("/api/admin/account/theme", { theme: next }, csrf);
    if (!res.data.ok) {
      setTheme(previous);
      applyTheme(previous);
      toast({ kind: "error", title: "Theme not saved", body: describeError(res.status, res.data.error) });
    }
  }

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <Menu
      label="Theme"
      trigger={(props) => (
        <button type="button" className="adm-iconbtn" aria-label={`Theme: ${current.label}`} title="Theme" {...props}>
          <Icon name="theme" />
        </button>
      )}
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="menuitemradio"
          aria-checked={theme === t.id}
          className="adm-menu-item"
          onClick={() => choose(t.id)}
        >
          <span>
            {t.label}
            <small style={{ display: "block", marginInlineStart: 0 }}>{t.description}</small>
          </span>
          {theme === t.id && <Icon name="check" size={16} className="adm-menu-check" />}
        </button>
      ))}
    </Menu>
  );
}
