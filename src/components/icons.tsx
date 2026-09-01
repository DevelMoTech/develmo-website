import type { ReactNode } from "react";

export const icons: Record<string, ReactNode> = {
  // service icons
  aiData: (
    <>
      <path d="M12 3v18M3 12h18" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  vision: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  web: <path d="M4 18V8l8-4 8 4v10M4 18h16M9 18v-5h6v5" />,
  cloud: <path d="M6 16a4 4 0 010-8 5 5 0 019.6-1.5A4 4 0 0117 16H6z" />,
  security: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  staff: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 19a6 6 0 0112 0M14 19a5 5 0 017 0" />
    </>
  ),
  // industry icons
  healthcare: <path d="M12 21s-7-4.5-7-10a4 4 0 017-2 4 4 0 017 2c0 5.5-7 10-7 10z" />,
  telecom: <path d="M4 14a8 8 0 0116 0M7 14a5 5 0 0110 0M12 14v6" />,
  oilgas: <path d="M6 21V9l6-5 6 5v12M9 21v-6h6v6" />,
  hospitality: <path d="M3 12l9-9 9 9M5 10v10h14V10" />,
  ecommerce: (
    <path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z" />
  ),
  banking: <path d="M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5" />,
  public: <path d="M4 20V8l8-4 8 4v12M4 20h16M10 20v-6h4v6" />,
  retail: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M3 9h18M7 21h10" />
    </>
  ),
  startups: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  gaming: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="4" />
      <path d="M7 12h3M8.5 10.5v3M15 11h.01M18 13h.01" />
    </>
  ),
  // why icons
  custom: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 16l-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  product: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19a6 6 0 0112 0M16 6a3 3 0 010 6M14 19a5 5 0 017 0" />
    </>
  ),
  enterprise: <path d="M4 7h16M4 12h16M4 17h10" />,
};

export const socialIcons: Record<string, ReactNode> = {
  facebook: (
    <path d="M13 22v-8h3l.5-3H13V9c0-.9.3-1.5 1.6-1.5H17V4.8C16.3 4.7 15.3 4.6 14.2 4.6 11.9 4.6 10 6 10 8.7V11H7v3h3v8z" />
  ),
  x: <path d="M17 3h3l-7 8 8 10h-6l-5-6-5 6H2l8-9L2 3h6l4 5z" />,
  linkedin: (
    <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21H22v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21H14z" />
  ),
  youtube: (
    <path d="M23 7.5a3 3 0 00-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 001 7.5 31 31 0 001 12a31 31 0 00.1 4.5 3 3 0 002.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 002.1-2.1A31 31 0 0023 12a31 31 0 00-.1-4.5zM10 15V9l5 3z" />
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#8E99B8" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="#8E99B8" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.2" />
    </>
  ),
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[name] ?? null}
    </svg>
  );
}

export function SocialIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {socialIcons[name] ?? null}
    </svg>
  );
}
