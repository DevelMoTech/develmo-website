"use client";

import { useEffect, useRef } from "react";

// DevelMo's own product footage — a live collage in the Why section.
const CLIPS = [
  { src: "/hero-2.mp4", label: "CrowdIQ · retail vision" },
  { src: "/hero-3.mp4", label: "OmniRoad · traffic AI" },
  { src: "/hero-1.mp4", label: "PadelIQ · sports analytics" },
];

export function ProductCollage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const vids = Array.from(root.querySelectorAll("video"));
    vids.forEach((v) => {
      v.muted = true;
    });
    // Only play clips while the collage is on screen (keeps the page light).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            const p = v.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
          } else {
            v.pause();
          }
        }
      },
      { threshold: 0.2 },
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  return (
    <div className="pcollage" ref={ref}>
      {CLIPS.map((c, i) => (
        <div className={`pc-item${i === 0 ? " pc-main" : ""}`} key={c.src}>
          <video src={c.src} muted loop playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />
          <span className="pc-tag">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
