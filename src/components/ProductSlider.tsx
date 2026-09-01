"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";

// Flagship products as a hero-style video carousel.
const SLIDES = [
  {
    name: "CrowdIQ",
    tag: "See beyond the crowd",
    desc: "Turn existing cameras into AI business intelligence, visitor detection, tracking IDs, dwell time and heatmaps, in real time.",
    video: "/hero-2.mp4",
    href: "/our-products/crowdiq",
  },
  {
    name: "OmniRoad 2.0",
    tag: "Road safety & traffic AI",
    desc: "AI traffic monitoring that classifies vehicles, detects accidents and alerts authorities instantly, on the cameras you already have.",
    video: "/hero-3.mp4",
    href: "/our-products/omni-road",
  },
  {
    name: "PadelIQ",
    tag: "AI sports & padel analytics",
    desc: "Movement tracking, rally insights and performance metrics for players, teams and leagues, powering the Riyadh Padel Federation.",
    video: "/hero-1.mp4",
    href: "/our-products/padeliq",
  },
];
const INTERVAL = 6500;

export function ProductSlider({ locale }: { locale: string }) {
  const tr = (s: string) => t(s, locale);
  const [i, setI] = useState(0);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    refs.current.forEach((v, k) => {
      if (!v) return;
      v.muted = true;
      if (k === i) {
        if (v.readyState === 0) v.load();
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        v.pause();
      }
    });
    const t = window.setTimeout(() => setI((v) => (v + 1) % SLIDES.length), INTERVAL);
    return () => window.clearTimeout(t);
  }, [i]);

  const s = SLIDES[i];

  return (
    <div className="pslider">
      <div className="ps-stage">
        {SLIDES.map((c, k) => (
          <video
            key={c.video}
            ref={(el) => {
              refs.current[k] = el;
            }}
            className={`ps-vid${k === i ? " on" : ""}`}
            src={c.video}
            muted
            loop
            playsInline
            preload={k === 0 ? "auto" : "none"}
            tabIndex={-1}
            aria-hidden="true"
          />
        ))}
        <div className="ps-ov" aria-hidden="true" />
        <div className="ps-content">
          <span className="ps-badge">
            <span className="sdot live" /> {tr("Live product")}
          </span>
          <h3 className="ps-name">{s.name}</h3>
          <p className="ps-tag">{s.tag}</p>
          <p className="ps-desc">{s.desc}</p>
          <Link className="btn btn-teal btn-lg" href={s.href}>
            {tr("Explore")} {s.name} →
          </Link>
        </div>
      </div>
      <div className="ps-nav">
        {SLIDES.map((c, k) => (
          <button
            key={c.name}
            className={`ps-tab${k === i ? " on" : ""}`}
            onClick={() => setI(k)}
            aria-label={`Show ${c.name}`}
          >
            <b>{c.name}</b>
            <span>{c.tag}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
