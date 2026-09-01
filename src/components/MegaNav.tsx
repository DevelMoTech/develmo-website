"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { pillars, servicesByPillar } from "@/lib/services";
import { industries } from "@/lib/industries";
import { products } from "@/lib/products";
import { site } from "@/lib/site";
import { ThemeToggle } from "@/components/ThemeToggle";
import { t, loc, locales, localeLabels } from "@/lib/i18n";

const Globe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="mu-globe">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
);

type TopKey = "what-we-do" | "who-we-help" | "our-products" | "who-we-are";

const companyLinks = [
  { label: "Who We Are", href: "/who-we-are" },
  { label: "About DevelMo", href: "/who-we-are/about-develmo" },
  { label: "Careers", href: "/jobs" },
  { label: "Knowledge Base", href: "/our-knowledge-base" },
  { label: "Insights", href: "/our-blogs" },
  { label: "Contact", href: "/contact-develmo" },
];

export function MegaNav({ locale }: { locale: string }) {
  const tr = (s: string) => t(s, locale);
  const [open, setOpen] = useState<TopKey | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [acc, setAcc] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  // Navigation is client-side, so the header never remounts. Collapse every
  // open surface whenever the route changes, including back/forward.
  useEffect(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(null);
    setMobileOpen(false);
    setRegionOpen(false);
    setAcc(null);
  }, [pathname]);

  // The drawer is a full-screen overlay; don't let the page scroll behind it.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Resizing past the drawer breakpoint hides the hamburger, which would
  // otherwise strand an open drawer with no way to close it.
  useEffect(() => {
    const mq = window.matchMedia("(min-width:1201px)");
    const f = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        setRegionOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function enter(key: TopKey) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(key);
  }
  function leave() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 140);
  }
  function go() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(null);
    setMobileOpen(false);
    setRegionOpen(false);
    // Clicking a panel link leaves focus inside the panel. The :focus-within
    // rule that keeps the mega menu open for keyboard users would then hold it
    // open on top of the new page, swallowing clicks on the hero CTAs.
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  }
  function setLang(code: string) {
    document.cookie = `locale=${code};path=/;max-age=31536000;samesite=lax`;
    window.location.reload();
  }

  return (
    <header className={`mega${scrolled ? " scrolled" : ""}`}>
      <div className="mega-util">
        <div className="container mega-util-in">
          <span className="mu-mono">
            <span className="mu-dot" aria-hidden="true" />
            GLOBAL DELIVERY · LHR / SYD / RUH / KHI
          </span>
          <div className="mu-right">
            <a className="mu-link" href={`mailto:${site.email}`}>
              {site.email}
            </a>
            <span className="mu-sep" aria-hidden="true" />
            <Link className="mu-link" href="/our-knowledge-base">
              {tr("Knowledge Base")}
            </Link>
            <span className="mu-sep" aria-hidden="true" />
            <ThemeToggle />
            <span className="mu-sep" aria-hidden="true" />
            <div className="mega-region" onMouseLeave={() => setRegionOpen(false)}>
              <button
                className="mega-region-btn"
                onClick={() => setRegionOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={regionOpen}
                aria-label={tr("Languages")}
              >
                <Globe /> {localeLabels[locale as keyof typeof localeLabels] ?? "English"}{" "}
                <span className="mega-caret" />
              </button>
              {regionOpen && (
                <div className="mega-region-menu" role="menu">
                  {locales.map((code) => (
                    <button
                      key={code}
                      role="menuitem"
                      aria-current={code === locale ? "true" : undefined}
                      className={code === locale ? "active" : ""}
                      onClick={() => setLang(code)}
                    >
                      {localeLabels[code]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="container mega-in">
        <Link className="brand" href="/" onClick={go} aria-label="DevelMo home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/develmo-logo.png" alt="DevelMo" className="brand-logo" />
        </Link>

        <nav className="mega-nav" aria-label="Primary">
          {/* WHAT WE DO */}
          <div className={`mega-top${open === "what-we-do" ? " open" : ""}`} onMouseEnter={() => enter("what-we-do")} onMouseLeave={leave}>
            <Link className="mega-toplink" href="/what-we-do" onClick={go}>
              {tr("What We Do")} <span className="mega-caret" />
            </Link>
            <div className="mega-panel">
              <div className="mega-panelwrap has-feature">
                <div className="mega-eyebrow">
                  <span className="me-idx">01</span> {tr("CAPABILITIES")}
                </div>
                <div className="mega-feature">
                  <p className="mega-bighead">{tr("What we do")}</p>
                  <p className="mega-blurb">
                    {tr("Custom AI, computer vision, cloud and software, engineered to how you actually operate.")}
                  </p>
                  <span className="mono-label">// FEATURED</span>
                  <Link className="mega-feature-card" href="/our-products/crowdiq" onClick={go}>
                    <span className="mff-eyebrow">{tr("Flagship product")}</span>
                    <b>CrowdIQ</b>
                    <small>{tr("Turn existing cameras into live business intelligence, at 90-95% detection accuracy.")}</small>
                    <span className="mega-feature-go">{tr("Explore CrowdIQ")} →</span>
                  </Link>
                </div>
                <div className="mega-grid">
                  {pillars.map((p) => (
                    <div className="mega-col" key={p.key}>
                      <h5>
                        <span className="gdot" />
                        {tr(p.title)}
                      </h5>
                      <ul>
                        {servicesByPillar(p.key).map((s) => (
                          <li key={s.slug}>
                            <Link href={`/what-we-do/${s.slug}`} onClick={go}>
                              {loc(s, locale, "services", s.slug).title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mega-foot">
                  <Link className="mega-alllink" href="/what-we-do" onClick={go}>
                    {tr("What We Do")} →
                  </Link>
                  <Link className="mega-alllink" href="/contact-develmo" onClick={go}>
                    {tr("Book a Free Consultation")} →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* WHO WE HELP */}
          <div className={`mega-top${open === "who-we-help" ? " open" : ""}`} onMouseEnter={() => enter("who-we-help")} onMouseLeave={leave}>
            <Link className="mega-toplink" href="/who-we-help" onClick={go}>
              {tr("Who We Help")} <span className="mega-caret" />
            </Link>
            <div className="mega-panel">
              <div className="mega-panelwrap">
                <div className="mega-eyebrow">
                  <span className="me-idx">02</span> {tr("INDUSTRIES")}
                </div>
                <div className="mega-grid cols4">
                  {industries.map((i) => {
                    const il = loc(i, locale, "industries", i.slug);
                    return (
                      <Link className="mega-prod" href={`/who-we-help/${i.slug}`} key={i.slug} onClick={go}>
                        <span className="iconchip">
                          <Icon name={i.icon} />
                        </span>
                        <span>
                          <b>{il.name}</b>
                          <small>{il.blurb}</small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="mega-foot">
                  <Link className="mega-alllink" href="/who-we-help" onClick={go}>
                    {tr("View all industries")} →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* OUR PRODUCTS */}
          <div className={`mega-top${open === "our-products" ? " open" : ""}`} onMouseEnter={() => enter("our-products")} onMouseLeave={leave}>
            <Link className="mega-toplink" href="/our-products" onClick={go}>
              {tr("Our Products")} <span className="mega-caret" />
            </Link>
            <div className="mega-panel">
              <div className="mega-panelwrap has-feature">
                <div className="mega-eyebrow">
                  <span className="me-idx">03</span> {tr("PRODUCTS")}
                </div>
                <div className="mega-feature">
                  <p className="mega-bighead">{tr("Our Products")}</p>
                  <p className="mega-blurb">
                    {tr("Production-grade AI products you can adopt as-is or have tailored to your environment.")}
                  </p>
                  <span className="mono-label">// FEATURED</span>
                  <Link className="mega-feature-card" href="/our-products/crowdiq" onClick={go}>
                    <span className="mff-eyebrow">{tr("Flagship product")}</span>
                    <b>CrowdIQ</b>
                    <small>{tr("Live visitor detection, dwell and heatmaps on the cameras you already have.")}</small>
                    <span className="mega-feature-go">{tr("Explore CrowdIQ")} →</span>
                  </Link>
                </div>
                <div className="mega-grid cols4">
                  {products.map((p) => {
                    const pl = loc(p, locale, "products", p.slug);
                    return (
                      <Link className="mega-prod" href={p.href} key={p.slug} onClick={go}>
                        <span className="plogo" style={{ background: p.bg, color: p.fg }}>
                          {p.initial}
                        </span>
                        <span>
                          <b>{p.title}</b>
                          <small>{pl.tagline}</small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="mega-foot">
                  <Link className="mega-alllink" href="/our-products" onClick={go}>
                    {tr("View all products")} →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* WHO WE ARE */}
          <div className={`mega-top${open === "who-we-are" ? " open" : ""}`} onMouseEnter={() => enter("who-we-are")} onMouseLeave={leave}>
            <Link className="mega-toplink" href="/who-we-are" onClick={go}>
              {tr("Who We Are")} <span className="mega-caret" />
            </Link>
            <div className="mega-panel">
              <div className="mega-panelwrap">
                <div className="mega-eyebrow">
                  <span className="me-idx">04</span> {tr("COMPANY")}
                </div>
                <div className="mega-grid cols4">
                  {companyLinks.map((c) => (
                    <Link className="mega-prod" href={c.href} key={c.href} onClick={go}>
                      <span>
                        <b>{tr(c.label)}</b>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* INSIGHTS */}
          <Link className="mega-toplink" href="/our-blogs" onClick={go}>
            {tr("Insights")}
          </Link>
        </nav>

        <div className="mega-spacer" />

        <div className="mega-cta">
          <Button href="/jobs" variant="ghost-d">
            {tr("Explore Careers")}
          </Button>
          <Button href="/contact-develmo" variant="navy">
            {tr("Book a Free Consultation")} <span className="btn-arrow" aria-hidden="true">→</span>
          </Button>
        </div>

        <button className="mega-hamb" aria-label="Toggle menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* MOBILE DRAWER */}
      <div className={`mega-drawer${mobileOpen ? " open" : ""}`}>
        <span className="drawer-mono">GLOBAL DELIVERY · LHR / SYD / RUH / KHI</span>
        <MobileAcc label={tr("What We Do")} k="wwd" acc={acc} setAcc={setAcc}>
          <Link href="/what-we-do" onClick={go}>
            {tr("What We Do")}
          </Link>
          {pillars.map((p) => (
            <Link key={p.key} href="/what-we-do" onClick={go} style={{ fontWeight: 700, color: "var(--ink)" }}>
              {tr(p.title)}
            </Link>
          ))}
        </MobileAcc>
        <MobileAcc label={tr("Who We Help")} k="wwh" acc={acc} setAcc={setAcc}>
          {industries.map((i) => (
            <Link key={i.slug} href={`/who-we-help/${i.slug}`} onClick={go}>
              {loc(i, locale, "industries", i.slug).name}
            </Link>
          ))}
        </MobileAcc>
        <MobileAcc label={tr("Our Products")} k="prod" acc={acc} setAcc={setAcc}>
          {products.map((p) => (
            <Link key={p.slug} href={p.href} onClick={go}>
              {p.title}
            </Link>
          ))}
        </MobileAcc>
        <MobileAcc label={tr("Who We Are")} k="company" acc={acc} setAcc={setAcc}>
          {companyLinks.map((c) => (
            <Link key={c.href} href={c.href} onClick={go}>
              {tr(c.label)}
            </Link>
          ))}
        </MobileAcc>
        <div className="mega-acc">
          <Link href="/our-blogs" onClick={go} style={{ display: "block", padding: "16px 2px", fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-head)", fontSize: 16 }}>
            {tr("Insights")}
          </Link>
        </div>

        <Button href="/contact-develmo" variant="navy">
          {tr("Book a Free Consultation")}
        </Button>
        <Button href="/jobs" variant="ghost-d">
          {tr("Explore Careers")}
        </Button>
        <div className="drawer-theme">
          <span>{tr("Theme")}</span>
          <ThemeToggle />
        </div>

        <div className="drawer-region">
          {locales.map((code) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              style={code === locale ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            >
              {localeLabels[code]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function MobileAcc({
  label,
  k,
  acc,
  setAcc,
  children,
}: {
  label: string;
  k: string;
  acc: string | null;
  setAcc: (v: string | null) => void;
  children: React.ReactNode;
}) {
  const open = acc === k;
  return (
    <div className="mega-acc">
      <button onClick={() => setAcc(open ? null : k)} aria-expanded={open}>
        {label}
        <span className="mega-caret" style={open ? { transform: "rotate(-135deg)" } : undefined} />
      </button>
      {open && <div className="mega-acc-body">{children}</div>}
    </div>
  );
}
