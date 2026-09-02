// Admin themes (brief §6.3). Independent of the public site's data-theme.
// Client-safe constants only; the server resolver lives in theme-server.ts.
export const THEMES = [
  { id: "system", label: "System", description: "Follows your device setting" },
  { id: "develmo-light", label: "DevelMo Light", description: "Brand palette, light surfaces" },
  { id: "develmo-dark", label: "DevelMo Dark", description: "Brand palette on ink" },
  { id: "midnight", label: "Midnight", description: "Deep ink, low luminance" },
  { id: "slate", label: "Slate", description: "Neutral grey, blue accent" },
  { id: "high-contrast", label: "High Contrast", description: "WCAG AAA oriented" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "dm_admin_theme";
export const THEME_STORAGE_KEY = "dm_admin_theme";

export function isTheme(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
