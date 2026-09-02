// Hand drawn 24px line icons for the console. No icon package (brief §4).
// Decorative by default (aria-hidden); pass `label` for a standalone icon.

const PATHS = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  posts: "M6 3h9l5 5v13H6zM14 3v6h6M9 13h7M9 17h7",
  jobs: "M4 8h16v12H4zM9 8V5h6v3M4 13h16",
  applications: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M16 4l2 2 3-3",
  media: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01",
  content: "M4 6h16M4 12h16M4 18h10",
  translate: "M4 5h9M8 3v2M11 5c-1 4-3 7-7 9M6 8c1 3 4 6 7 7M13 20l4-9 4 9M14.5 17h5",
  inbox: "M4 4h16v16H4zM4 14h5l1 2h4l1-2h5",
  seo: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5M8 11h6M11 8v6",
  gauge: "M4 14a8 8 0 0 1 16 0M12 14l4-5M12 14h.01M3 20h18",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-5-6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L5.5 8.5 3.5 8l-1 3 2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z",
  audit: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  search: "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5 20 20",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  chevronLeft: "M15 5l-7 7 7 7",
  chevronRight: "M9 5l7 7-7 7",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  check: "M5 12l5 5 9-10",
  theme: "M12 3a9 9 0 1 0 0 18zM12 3v18",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  external: "M14 4h6v6M20 4l-9 9M18 13v7H4V6h7",
  plus: "M12 5v14M5 12h14",
  alert: "M12 3l10 18H2zM12 10v4M12 18h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7h.01",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  download: "M12 4v12M6 11l6 6 6-6M4 20h16",
  logout: "M10 4H4v16h6M14 8l5 4-5 4M19 12H9",
  sort: "M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10",
  upload: "M12 16V4M6 9l6-6 6 6M4 20h16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  tag: "M3 12V4h8l9 9-8 8zM7 8h.01",
  folder: "M3 6h6l2 2h10v11H3z",
  history: "M4 12a8 8 0 1 1 2.3 5.7M4 18v-5h5M12 8v4l3 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  image: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01",
  edit: "M4 20h4l11-11-4-4L4 16zM13 7l4 4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      focusable="false"
    >
      {label && <title>{label}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
