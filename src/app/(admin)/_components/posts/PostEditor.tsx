"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaView } from "@/lib/admin/media";
import { localeLabels } from "@/lib/i18n";
import { TRANSLATION_LOCALES, type TranslationLocale } from "@/lib/schemas/post";
import { readingTimeMinutes, slugify } from "@/lib/slug";
import type { EditorValue, TranslationDraft } from "../../_lib/editor-types";
import { useIsClient } from "../../_lib/useIsClient";
import { useUnsavedChanges } from "../../_lib/useUnsavedChanges";
import { apiPost, describeError } from "../api-client";
import { MediaPicker } from "../media/MediaPicker";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button, ButtonLink } from "../ui/Button";
import { Checkbox, Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { MarkdownToolbar, useMarkdownFormatting } from "../ui/MarkdownToolbar";
import { ConfirmDialog } from "../ui/Modal";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

// ISO -> datetime-local in the browser's zone. Runs on the client only.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const BASE_PATH = { blog: "/our-blogs", kb: "/our-knowledge-base" } as const;

type SlugResult = { slug: string; type: "blog" | "kb"; status: "ok" | "taken" | "invalid"; suggestion?: string };

export function PostEditor({
  csrf,
  postId,
  initial,
  categories,
  savedSlug,
  savedType,
  savedStatus,
  canWrite,
  updatedAt,
  revisionCount,
}: {
  csrf: string;
  postId: string | null;
  initial: EditorValue;
  categories: string[];
  savedSlug: string | null;
  savedType: "blog" | "kb" | null;
  savedStatus: EditorValue["status"] | null;
  canWrite: boolean;
  updatedAt?: string;
  revisionCount?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<EditorValue>(initial);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial));
  const isClient = useIsClient();
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));

  const dirty = JSON.stringify(value) !== saved;
  useUnsavedChanges(dirty && canWrite);

  const [slugTouched, setSlugTouched] = useState(initial.slug !== "" && initial.slug !== slugify(initial.title));
  // Result of the last uniqueness check, keyed by what it answered; the
  // displayed status is derived so a changed slug reads "checking" at once.
  const [slugResult, setSlugResult] = useState<SlugResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<"hero" | "og" | "body" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createRedirect, setCreateRedirect] = useState(true);
  const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<{ markdown: string; html: string } | null>(null);
  const [locale, setLocale] = useState<"en" | TranslationLocale>("en");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = useCallback(<K extends keyof EditorValue>(key: K, v: EditorValue[K]) => setValue((cur) => ({ ...cur, [key]: v })), []);

  // Slug follows the title until the editor types a slug by hand.
  function onTitle(title: string) {
    setValue((cur) => ({ ...cur, title, slug: slugTouched ? cur.slug : slugify(title) }));
  }

  // Live uniqueness check (brief §3.3).
  const slugUnchanged = value.slug === savedSlug && value.type === savedType;
  const slugAnswer = slugResult && slugResult.slug === value.slug && slugResult.type === value.type ? slugResult : null;
  const slugStatus: "idle" | "checking" | "ok" | "taken" | "invalid" = !value.slug ? "idle" : slugUnchanged ? "ok" : slugAnswer ? slugAnswer.status : "checking";
  useEffect(() => {
    const slug = value.slug;
    const type = value.type;
    if (!slug || slugUnchanged) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({ type, slug });
        if (postId) sp.set("exclude", postId);
        const res = await fetch(`/api/admin/posts/slug-check?${sp}`, { signal: ctrl.signal, credentials: "same-origin" });
        const data = (await res.json()) as { ok: boolean; available?: boolean; suggestion?: string };
        if (!data.ok) setSlugResult({ slug, type, status: "invalid" });
        else setSlugResult({ slug, type, status: data.available ? "ok" : "taken", suggestion: data.suggestion });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSlugResult({ slug, type, status: "invalid" });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value.slug, value.type, postId, slugUnchanged]);

  // Markdown preview through the server pipeline, only while the preview
  // tab is showing.
  const activeBody = locale === "en" ? value.bodyMd : value.translations[locale].bodyMd;
  const writeBody = useCallback(
    (next: string) => {
      if (locale === "en") set("bodyMd", next);
      else setValue((cur) => ({ ...cur, translations: { ...cur.translations, [locale]: { ...cur.translations[locale], bodyMd: next } } }));
    },
    [locale, set],
  );
  // Toolbar clicks, Ctrl+B / Ctrl+I / Ctrl+K in the textarea, and inserting
  // an image all go through this, so the cursor ends up where it should.
  const md = useMarkdownFormatting(bodyRef, activeBody, writeBody);
  useEffect(() => {
    if (bodyTab !== "preview") return;
    if (preview && preview.markdown === activeBody) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await apiPost<{ html: string }>("/api/admin/posts/render", { markdown: activeBody }, csrf);
      if (!ctrl.signal.aborted) setPreview({ markdown: activeBody, html: res.data.ok ? res.data.html : "<p>Preview unavailable.</p>" });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [bodyTab, activeBody, csrf, preview]);

  const readingTime = useMemo(() => readingTimeMinutes(value.bodyMd), [value.bodyMd]);
  const slugChanged = savedSlug !== null && (value.slug !== savedSlug || value.type !== savedType);
  const offerRedirect = slugChanged && savedStatus !== null && savedStatus !== "draft";

  const save = useCallback(async () => {
    if (pending || !canWrite) return;
    setPending(true);
    setError(null);
    setIssues({});
    const { heroImage, ogImage, ...rest } = value;
    const body = {
      ...rest,
      heroImageId: heroImage?.id ?? null,
      ogImageId: ogImage?.id ?? null,
      translations: Object.fromEntries(TRANSLATION_LOCALES.map((l) => [l, value.translations[l]]).filter(([, t]) => (t as TranslationDraft).title || (t as TranslationDraft).excerpt || (t as TranslationDraft).bodyMd)),
    };
    const res = postId
      ? await apiPost<{ redirectCreated: boolean }>("/api/admin/posts/update", { ...body, id: postId, createRedirect }, csrf)
      : await apiPost<{ id: string }>("/api/admin/posts/create", body, csrf);
    setPending(false);
    if (!res.data.ok) {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      setError(res.data.error === "slug_taken" ? "That slug is already in use. Pick another." : describeError(res.status, res.data.error, res.data.retryAfter));
      toast({ kind: "error", title: "Not saved" });
      return;
    }
    setSaved(JSON.stringify(value));
    if (!postId) {
      const id = (res.data as { id: string }).id;
      toast({ kind: "success", title: "Post created", body: value.status === "published" ? "It is live on the site." : undefined });
      router.replace(`/admin/posts/${id}`);
      return;
    }
    const redirected = (res.data as { redirectCreated?: boolean }).redirectCreated;
    toast({ kind: "success", title: "Saved", body: redirected ? `A 301 from ${BASE_PATH[savedType ?? "blog"]}/${savedSlug} was created.` : value.status === "published" ? "The public page was revalidated." : undefined });
    router.refresh();
  }, [pending, canWrite, postId, createRedirect, csrf, value, savedSlug, savedType, router, toast]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  async function remove() {
    if (!postId) return;
    setPending(true);
    const res = await apiPost("/api/admin/posts/delete", { id: postId }, csrf);
    setPending(false);
    if (res.data.ok) {
      setSaved(JSON.stringify(value));
      toast({ kind: "success", title: "Post deleted" });
      router.push("/admin/posts");
    } else toast({ kind: "error", title: "Not deleted", body: describeError(res.status, res.data.error) });
  }

  function insertImage(m: MediaView) {
    // On its own paragraph at the cursor, with the cursor left after it.
    md.insert(`![${m.altText}](${m.url})`);
  }

  function setTranslation(l: TranslationLocale, key: keyof TranslationDraft, v: string) {
    setValue((cur) => ({ ...cur, translations: { ...cur.translations, [l]: { ...cur.translations[l], [key]: v } } }));
  }

  function coverage(l: TranslationLocale): number {
    const t = value.translations[l];
    return [t.title, t.excerpt, t.bodyMd].filter((s) => s.trim()).length;
  }

  function commitTags(text: string) {
    set("tags", [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20));
  }
  const previewHref = postId ? `/admin/posts/${postId}/preview${locale === "en" ? "" : `?locale=${locale}`}` : null;
  const publicPath = `${BASE_PATH[value.type]}/${value.slug || "…"}`;
  const disabled = !canWrite || pending;

  return (
    <form
      className="adm-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <div className="adm-editor-main">
        {error && <Alert kind="error">{error}</Alert>}
        {!canWrite && <Alert kind="info">You can read this post but your role cannot change it.</Alert>}

        <Card title="Content">
          <div className="adm-form">
            <div className="adm-editor-locales" role="tablist" aria-label="Language">
              <button type="button" role="tab" aria-selected={locale === "en"} className="adm-tab" onClick={() => setLocale("en")}>
                English
              </button>
              {TRANSLATION_LOCALES.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={locale === l} className="adm-tab" onClick={() => setLocale(l)}>
                  {localeLabels[l]} <Badge tone={coverage(l) === 3 ? "ok" : coverage(l) === 0 ? "muted" : "warn"}>{coverage(l)}/3</Badge>
                </button>
              ))}
            </div>

            {locale === "en" ? (
              <>
                <Input id="p-title" label="Title" required maxLength={200} value={value.title} onChange={(e) => onTitle(e.target.value)} error={issues.title} disabled={disabled} />
                <div className="adm-field">
                  <label className="adm-label" htmlFor="p-slug">Slug</label>
                  <div className="adm-slug-row">
                    <span className="adm-slug-base adm-mono">{BASE_PATH[value.type]}/</span>
                    <input
                      id="p-slug"
                      className="adm-input adm-mono"
                      value={value.slug}
                      maxLength={120}
                      aria-invalid={issues.slug || slugStatus === "taken" || slugStatus === "invalid" ? "true" : undefined}
                      aria-describedby="p-slug-status"
                      onChange={(e) => {
                        setSlugTouched(true);
                        set("slug", e.target.value.toLowerCase());
                      }}
                      onBlur={() => set("slug", slugify(value.slug))}
                      disabled={disabled}
                    />
                    <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { setSlugTouched(false); set("slug", slugify(value.title)); }}>From title</Button>
                  </div>
                  <p id="p-slug-status" className={slugStatus === "taken" || slugStatus === "invalid" || issues.slug ? "adm-error" : "adm-help"} aria-live="polite">
                    {issues.slug
                      ? issues.slug
                      : slugStatus === "idle"
                        ? "Lowercase letters, numbers and hyphens."
                        : slugStatus === "checking"
                          ? "Checking availability"
                          : slugStatus === "ok"
                            ? `Available: ${publicPath}`
                            : slugStatus === "invalid"
                              ? "Lowercase letters, numbers and single hyphens only."
                              : `Already used. Try ${slugAnswer?.suggestion}`}
                    {slugStatus === "taken" && slugAnswer?.suggestion && (
                      <>
                        {" "}
                        <button type="button" className="adm-link" onClick={() => { setSlugTouched(true); set("slug", slugAnswer.suggestion!); }}>Use it</button>
                      </>
                    )}
                  </p>
                  {offerRedirect && (
                    <Checkbox id="p-redirect" label={`Create a 301 redirect from ${BASE_PATH[savedType ?? "blog"]}/${savedSlug} to the new address`} checked={createRedirect} onChange={(e) => setCreateRedirect(e.target.checked)} disabled={disabled} />
                  )}
                </div>
                <Textarea id="p-excerpt" label="Excerpt" help={`${value.excerpt.length}/600. Used on listing cards and as the default meta description.`} maxLength={600} rows={3} value={value.excerpt} onChange={(e) => set("excerpt", e.target.value)} error={issues.excerpt} disabled={disabled} />
              </>
            ) : (
              <>
                <Input id={`p-title-${locale}`} label={`Title (${localeLabels[locale]})`} maxLength={200} value={value.translations[locale].title} onChange={(e) => setTranslation(locale, "title", e.target.value)} help={`English: ${value.title || "untitled"}`} disabled={disabled} dir="auto" />
                <Textarea id={`p-excerpt-${locale}`} label={`Excerpt (${localeLabels[locale]})`} rows={3} maxLength={600} value={value.translations[locale].excerpt} onChange={(e) => setTranslation(locale, "excerpt", e.target.value)} disabled={disabled} dir="auto" />
              </>
            )}

            <div className="adm-field">
              <div className="adm-editor-bodyhead">
                <label className="adm-label" htmlFor="p-body">{locale === "en" ? "Body (markdown)" : `Body (${localeLabels[locale]}, markdown)`}</label>
                <div className="adm-tabs adm-tabs-sm" role="tablist" aria-label="Body view">
                  <button type="button" role="tab" aria-selected={bodyTab === "write"} className="adm-tab" onClick={() => setBodyTab("write")}>Write</button>
                  <button type="button" role="tab" aria-selected={bodyTab === "preview"} className="adm-tab" onClick={() => setBodyTab("preview")}>Preview</button>
                </div>
              </div>
              {bodyTab === "write" ? (
                <>
                <MarkdownToolbar run={md.run} disabled={disabled} onInsertImage={() => setPicker("body")} />
                <textarea
                  id="p-body"
                  ref={bodyRef}
                  onKeyDown={md.onKeyDown}
                  className="adm-input adm-editor-body"
                  value={activeBody}
                  onChange={(e) => (locale === "en" ? set("bodyMd", e.target.value) : setTranslation(locale, "bodyMd", e.target.value))}
                  aria-invalid={issues.bodyMd ? "true" : undefined}
                  aria-describedby="p-body-help"
                  disabled={disabled}
                  dir={locale === "en" ? undefined : "auto"}
                  spellCheck
                />
                </>
              ) : (
                <div className="adm-md-preview prose" aria-live="polite" aria-busy={preview?.markdown !== activeBody}>
                  {preview && preview.markdown === activeBody ? (
                    // The HTML comes from /api/admin/posts/render, which is the
                    // remark + rehype-sanitize pipeline; nothing unsanitized is injected.
                    activeBody.trim() ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p className="adm-muted">Nothing to preview yet.</p>
                  ) : (
                    <p className="adm-muted">Rendering preview</p>
                  )}
                </div>
              )}
              <p id="p-body-help" className={issues.bodyMd ? "adm-error" : "adm-help"}>
                {issues.bodyMd ?? `CommonMark: headings, lists, links, images, code. Raw HTML is removed. About ${readingTime} min read.`}
              </p>
            </div>
          </div>
        </Card>

        <Card title="Search and sharing" description="Leave blank to use the title and excerpt.">
          <div className="adm-form">
            <Input id="p-meta-title" label="Meta title" help={`${value.metaTitle.length}/60 recommended`} maxLength={200} value={value.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} error={issues.metaTitle} disabled={disabled} />
            <Textarea id="p-meta-desc" label="Meta description" help={`${value.metaDescription.length}/155 recommended`} rows={2} maxLength={320} value={value.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} error={issues.metaDescription} disabled={disabled} />
            <Input id="p-canonical" label="Canonical override" help="An https URL or a site path. Only when this post is a copy of something published elsewhere." value={value.canonicalOverride} onChange={(e) => set("canonicalOverride", e.target.value)} error={issues.canonicalOverride} disabled={disabled} placeholder={publicPath} />
            <ImageField id="p-og" label="Social sharing image" help="1200×630 works best. Falls back to the hero image, then the site default." media={value.ogImage} onChoose={() => setPicker("og")} onClear={() => set("ogImage", null)} error={issues.ogImageId} disabled={disabled} />
            <Toggle id="p-noindex" checked={value.noindex} onChange={(v) => set("noindex", v)} label="Hide from search engines (noindex)" disabled={disabled} />
          </div>
        </Card>
      </div>

      <aside className="adm-editor-side">
        <Card title="Publishing">
          <div className="adm-form">
            <Select id="p-status" label="Status" options={STATUS_OPTIONS} value={value.status} onChange={(e) => set("status", e.target.value as EditorValue["status"])} error={issues.status} disabled={disabled} />
            <Input
              id="p-published"
              type="datetime-local"
              label={value.status === "scheduled" ? "Goes live at" : "Publish date"}
              help={value.status === "scheduled" ? "Must be in the future. The site shows it automatically once the time passes." : value.status === "published" ? "Blank means now." : undefined}
              value={isClient ? toLocalInput(value.publishedAt) : ""}
              onChange={(e) => set("publishedAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
              error={issues.publishedAt}
              disabled={disabled}
              required={value.status === "scheduled"}
            />
            <Select id="p-type" label="Section" options={[{ value: "blog", label: "Blog" }, { value: "kb", label: "Knowledge base" }]} value={value.type} onChange={(e) => set("type", e.target.value as "blog" | "kb")} disabled={disabled} />
            <div className="adm-actions">
              <Button type="submit" disabled={disabled || slugStatus === "taken"}>{pending ? "Saving" : postId ? "Save" : "Create post"}</Button>
              {previewHref && (
                <ButtonLink href={previewHref} target="_blank" rel="noreferrer" variant="ghost">
                  <Icon name="eye" size={18} /> Preview
                </ButtonLink>
              )}
            </div>
            {dirty && canWrite && <p className="adm-help">Unsaved changes. Ctrl+S saves.</p>}
            {postId && updatedAt && (
              <dl className="adm-dl">
                <dt>Updated</dt>
                <dd>{updatedAt}</dd>
                <dt>Reading time</dt>
                <dd>{readingTime} min</dd>
                <dt>Revisions</dt>
                <dd><a className="adm-link" href={`/admin/posts/${postId}/revisions`}>{revisionCount ?? 0} saved</a></dd>
              </dl>
            )}
          </div>
        </Card>

        <Card title="Organisation">
          <div className="adm-form">
            <Input id="p-category" label="Category" maxLength={80} value={value.category} onChange={(e) => set("category", e.target.value)} error={issues.category} disabled={disabled} list="p-category-list" />
            <datalist id="p-category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Input
              id="p-tags"
              label="Tags"
              help="Comma separated, up to 20."
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={(e) => commitTags(e.target.value)}
              error={issues.tags}
              disabled={disabled}
            />
            {value.tags.length > 0 && (
              <div className="adm-chips" aria-label="Current tags">
                {value.tags.map((t) => (
                  <Badge key={t} tone="muted">{t}</Badge>
                ))}
              </div>
            )}
            <Input id="p-author" label="Author" maxLength={80} value={value.authorName} onChange={(e) => set("authorName", e.target.value)} error={issues.authorName} disabled={disabled} />
          </div>
        </Card>

        <Card title="Hero image">
          <ImageField id="p-hero" label="Shown above the article and used for sharing by default." media={value.heroImage} onChoose={() => setPicker("hero")} onClear={() => set("heroImage", null)} error={issues.heroImageId} disabled={disabled} />
        </Card>

        {postId && canWrite && (
          <Card title="Danger zone">
            <p>Deleting removes the post, its revisions and translations. The audit trail is kept.</p>
            <div className="adm-actions" style={{ marginBlockStart: 12 }}>
              <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete post</Button>
            </div>
          </Card>
        )}
      </aside>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        csrf={csrf}
        canWrite={canWrite}
        title={picker === "body" ? "Insert an image" : picker === "og" ? "Choose a sharing image" : "Choose a hero image"}
        onPick={(m) => {
          if (picker === "hero") set("heroImage", m);
          else if (picker === "og") set("ogImage", m);
          else if (picker === "body") insertImage(m);
          setPicker(null);
        }}
      />
      <ConfirmDialog
        key={confirmDelete ? "open" : "closed"}
        id="delete-post"
        open={confirmDelete}
        title={`Delete "${value.title || "this post"}"?`}
        body="This cannot be undone. Type the slug to confirm."
        confirmLabel="Delete post"
        typed={savedSlug ?? value.slug}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}

function ImageField({ id, label, help, media, onChoose, onClear, error, disabled }: { id: string; label: string; help?: string; media: MediaView | null; onChoose: () => void; onClear: () => void; error?: string; disabled: boolean }) {
  return (
    <div className="adm-field">
      <span className="adm-label" id={`${id}-label`}>{label}</span>
      {media ? (
        <div className="adm-image-field">
          <img src={media.url} alt={media.altText} width={media.width ?? undefined} height={media.height ?? undefined} />
          <div>
            <div className="adm-media-name">{media.filename}</div>
            <div className="adm-help">Alt: {media.altText}</div>
            <div className="adm-actions" style={{ marginBlockStart: 8 }}>
              <Button variant="ghost" size="sm" onClick={onChoose} disabled={disabled} aria-describedby={`${id}-label`}>Change</Button>
              <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>Remove</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="adm-actions">
          <Button variant="ghost" size="sm" onClick={onChoose} disabled={disabled} aria-describedby={`${id}-label`}><Icon name="image" size={16} /> Choose image</Button>
        </div>
      )}
      {error ? <p className="adm-error">{error}</p> : help ? <p className="adm-help">{help}</p> : null}
    </div>
  );
}
