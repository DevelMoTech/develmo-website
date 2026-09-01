"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/lib/site";
import { Button } from "@/components/ui";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav">
      <div className="container nav-in">
        <Link className="brand" href="/" onClick={() => setOpen(false)}>
          <span className="mk" />
          DevelMo
        </Link>
        <nav aria-label="Primary">
          <ul className="nav-links">
            {site.nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-cta">
          <Button href="/contact-develmo" variant="navy">
            Get Free Consultation
          </Button>
          <button
            className="hamb"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      {open && (
        <div className="mobile-menu">
          {site.nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          <Link href="/contact-develmo" onClick={() => setOpen(false)}>
            Get Free Consultation
          </Link>
        </div>
      )}
    </header>
  );
}
