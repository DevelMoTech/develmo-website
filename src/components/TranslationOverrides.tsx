"use client";

import { setTranslationOverrides, type OverrideMap } from "@/lib/i18n/overrides";

// Seeds the client's translation registry from the server (brief §3.9).
//
// t() is called during hydration by MegaNav, ContactForm, HeroStage and the
// other client components, so the client needs the same overrides the server
// rendered with or the markup would not match. The registry is filled during
// this component's render rather than in an effect, because an effect runs
// after its siblings have already rendered and hydration would mismatch.
// SiteChrome renders this first, so it is set before anything reads it.
//
// Rendering nothing means no markup changes and nothing is serialised into
// the page beyond the props themselves.
export function TranslationOverrides({ value }: { value: OverrideMap }) {
  setTranslationOverrides(value);
  return null;
}
