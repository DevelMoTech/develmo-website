"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { stats } from "@/lib/site";
import { t } from "@/lib/i18n";

// DevelMo's own computer-vision footage, run as an auto-advancing proof-of-work slider.
const CLIPS = [
  { src: "/hero-1.mp4", poster: "/hero-1.jpg", name: "PadelIQ", tag: "AI sports & padel analytics" },
  { src: "/hero-2.mp4", poster: "/hero-2.jpg", name: "CrowdIQ", tag: "Retail & venue intelligence" },
  { src: "/hero-3.mp4", poster: "/hero-3.jpg", name: "OmniRoad 2.0", tag: "Traffic & road-safety AI" },
];
const INTERVAL = 7000;

export function HeroStage({ locale }: { locale: string }) {
  const tr = (s: string) => t(s, locale);
  const [i, setI] = useState(0);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  // Play only the active clip (it loops), pause the rest, and auto-advance.
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
    const t = window.setTimeout(() => setI((v) => (v + 1) % CLIPS.length), INTERVAL);
    return () => window.clearTimeout(t);
  }, [i]);

  // Resume the active clip when the tab/window becomes visible again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const v = refs.current[i];
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [i]);

  const clip = CLIPS[i];

  return (
    <section className="hero vhero">
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-fallback" />
        {CLIPS.map((c, k) => (
          <video
            key={c.src}
            ref={(el) => {
              refs.current[k] = el;
            }}
            className={`hero-vid${k === i ? " on" : ""}`}
            src={c.src}
            poster={c.poster}
            muted
            loop
            playsInline
            preload={k === 0 ? "auto" : "none"}
            tabIndex={-1}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="hero-ov" aria-hidden="true" />

      <div className="hero-now">
        <span className="hn-live">
          <i />
          {tr("Live AI")}
        </span>
        <span className="hn-name">{clip.name}</span>
        <span className="hn-tag">{tr(clip.tag)}</span>
        <span className="hn-dots">
          {CLIPS.map((c, k) => (
            <button
              key={c.src}
              className={k === i ? "on" : ""}
              onClick={() => setI(k)}
              aria-label={`Show ${c.name}`}
            />
          ))}
        </span>
      </div>

      <div className="container hero-in">
        <span className="hero-rule" aria-hidden="true" />
        <h1>
          {locale === "en" ? (
            <>
              AI That <span className="hl">Fits</span>
              <br />
              Your Business
            </>
          ) : (
            tr("AI That Fits Your Business")
          )}
        </h1>
        <p className="sub">
          {tr(
            "DevelMo helps startups, enterprises and growing teams build intelligent products, automate operations and turn live data into decisions, through AI, computer vision, cloud and custom software.",
          )}
        </p>
        <div className="hero-cta">
          <Button href="/contact-develmo" variant="teal" lg>
            {tr("Book a Free Consultation")}
          </Button>
          <Button href="/our-products" variant="ghost" rect lg>
            {tr("See Our Products")}
          </Button>
        </div>
        <p className="hero-micro">
          <span>
            {locale === "en" ? (
              <>
                Tell us your goal. We map the highest-impact AI in{" "}
                <strong>one 30-minute call</strong>.
              </>
            ) : (
              tr("Tell us your goal. We map the highest-impact AI in one 30-minute call.")
            )}
          </span>
        </p>
        <div className="hero-stats">
          {stats.map((s) => (
            <div className="hstat" key={s.label}>
              <b>{s.value}</b>
              <span>{tr(s.label)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
