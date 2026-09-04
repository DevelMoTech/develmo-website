"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaSettings } from "@/lib/schemas/performance";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

// Common breakpoints, so the field is a choice rather than a guess.
const PRESETS = [
  { value: 0, label: "Never, always play the video" },
  { value: 480, label: "Phones (480px and below)" },
  { value: 768, label: "Phones and small tablets (768px and below)" },
  { value: 1024, label: "Tablets and below (1024px and below)" },
];

export function MediaSettingsForm({ initial, csrf, canWrite }: { initial: MediaSettings; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [autoplay, setAutoplay] = useState(initial.heroAutoplayMobile);
  const [width, setWidth] = useState(String(initial.posterOnlyMaxWidth));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = autoplay !== initial.heroAutoplayMobile || width !== String(initial.posterOnlyMaxWidth);
  const custom = !PRESETS.some((p) => String(p.value) === width);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d+$/.test(width.trim())) {
      setError("Enter a width in pixels, or 0 to always play the video");
      return;
    }
    setPending(true);
    setError(null);
    const res = await apiPost("/api/admin/performance/media", { heroAutoplayMobile: autoplay, posterOnlyMaxWidth: Number(width) }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Media settings saved", body: "The home page picks them up on the next request." });
      router.refresh();
    } else {
      setError(describeError(res.status, res.data.error));
      toast({ kind: "error", title: "Not saved" });
    }
  }

  return (
    <Card title="Hero video" description="The three clips on the home page total about 2.5 MB. These settings decide who is asked to download them.">
      <form className="adm-form" onSubmit={save} noValidate>
        <Toggle
          id="media-autoplay"
          checked={autoplay}
          onChange={setAutoplay}
          label={autoplay ? "Play the clips on touch devices" : "Touch devices see the poster image only"}
          disabled={!canWrite || pending}
        />
        <div className="adm-field">
          <label className="adm-label" htmlFor="media-poster">Poster only below</label>
          <select id="media-poster" className="adm-input adm-select" value={custom ? "custom" : width} onChange={(e) => e.target.value !== "custom" && setWidth(e.target.value)} disabled={!canWrite || pending}>
            {PRESETS.map((p) => (
              <option key={p.value} value={String(p.value)}>{p.label}</option>
            ))}
            {custom && <option value="custom">Custom: {width}px</option>}
          </select>
          <p className="adm-help">Viewports at or below this width show the poster image and never fetch the video.</p>
        </div>
        {custom && <Input id="media-width" label="Custom width (px)" type="number" min={0} max={2000} inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} disabled={!canWrite || pending} />}
        {error && <Alert kind="error">{error}</Alert>}
        <Alert kind="info" live={false}>
          A visitor who has asked their system for reduced motion never gets the video, whatever these say. The slider still advances through the
          three posters, so the hero reads the same.
        </Alert>
        {canWrite && (
          <div className="adm-actions">
            <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save media settings"}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}
