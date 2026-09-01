"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

export function StickyCta({ locale = "en" }: { locale?: string }) {
  const pathname = usePathname();
  // Don't show it on the contact page (you're already there).
  if (pathname?.startsWith("/contact-develmo")) return null;

  return (
    <Link href="/contact-develmo" className="sticky-cta" aria-label="Let's talk: book a free consultation">
      <span className="sc-label">{t("Let's Talk", locale)}</span>
      <svg className="sc-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
      </svg>
    </Link>
  );
}
