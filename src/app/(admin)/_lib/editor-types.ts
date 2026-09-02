import type { MediaView } from "@/lib/admin/media";
import { TRANSLATION_LOCALES, type TranslationLocale } from "@/lib/schemas/post";

// Shape shared by the server page (which builds it) and the client editor.
export type TranslationDraft = { title: string; excerpt: string; bodyMd: string };

export type EditorValue = {
  type: "blog" | "kb";
  title: string;
  slug: string;
  excerpt: string;
  bodyMd: string;
  category: string;
  tags: string[];
  authorName: string;
  heroImage: MediaView | null;
  status: "draft" | "scheduled" | "published" | "archived";
  // ISO timestamp or null; shown as a datetime-local in the browser's zone.
  publishedAt: string | null;
  canonicalOverride: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: MediaView | null;
  noindex: boolean;
  translations: Record<TranslationLocale, TranslationDraft>;
};

export function emptyTranslations(): Record<TranslationLocale, TranslationDraft> {
  return Object.fromEntries(TRANSLATION_LOCALES.map((l) => [l, { title: "", excerpt: "", bodyMd: "" }])) as Record<TranslationLocale, TranslationDraft>;
}

