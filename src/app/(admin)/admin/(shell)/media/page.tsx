import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { MediaBrowser, Uploader, type LibraryItem } from "@/app/(admin)/_components/media/MediaLibrary";
import { EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { Pagination } from "@/app/(admin)/_components/ui/DataTable";
import { listFolders, listMedia, listTags, MEDIA_PAGE_SIZE, mediaUsage, toView } from "@/lib/admin/media";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Media" };

const querySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  folder: z.string().trim().max(120).catch(""),
  tag: z.string().trim().max(40).catch(""),
  view: z.enum(["grid", "list"]).catch("grid"),
  sort: z.enum(["newest", "oldest", "name"]).catch("newest"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

function href(base: Record<string, string | number>, patch: Record<string, string | number>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    const def = k === "view" ? "grid" : k === "sort" ? "newest" : k === "page" ? 1 : "";
    if (v !== def && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `/admin/media?${s}` : "/admin/media";
}

// Media library (brief §3.10): grid and list views, search by file name and
// alt text, folders and tags, all URL state. Uploads, details, replace,
// usage and delete live in the client browser component.
export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/media", { permission: "media:read" });
  const canWrite = can(user.role, "media:write");
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = querySchema.parse({ q: first(raw.q), folder: first(raw.folder), tag: first(raw.tag), view: first(raw.view), sort: first(raw.sort), page: first(raw.page) });
  const [{ rows, total }, folders, tags, csrf] = await Promise.all([listMedia(q), listFolders(), listTags(), getCsrfToken()]);
  const usage = await mediaUsage(rows);
  const items: LibraryItem[] = rows.map((r) => ({ ...toView(r), usage: usage.get(r.id) ?? [] }));
  const filtered = Boolean(q.q || q.folder || q.tag);
  const base = { q: q.q, folder: q.folder, tag: q.tag, view: q.view, sort: q.sort, page: q.page };
  const tableParams = { page: q.page, pageSize: MEDIA_PAGE_SIZE, sort: q.sort, dir: "asc" as const, q: q.q, filters: { folder: q.folder, tag: q.tag, view: q.view } };

  return (
    <>
      <PageHeader kicker="Content" title="Media" description="Images for posts and pages, stored outside the repository under unguessable keys and served from this site's own address." />
      {canWrite && <Uploader csrf={csrf} folder={q.folder === "/" ? "" : q.folder} />}
      <form className="adm-toolbar" method="get" action="/admin/media" role="search" aria-label="Filter the media library" style={{ marginBlockStart: 18 }}>
        <input type="hidden" name="view" value={q.view} />
        <input type="hidden" name="sort" value={q.sort} />
        <div className="adm-field adm-field-q">
          <label className="adm-label" htmlFor="media-q">Search file name or alt text</label>
          <input id="media-q" className="adm-input" type="search" name="q" defaultValue={q.q} />
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="media-folder">Folder</label>
          <select id="media-folder" className="adm-input adm-select" name="folder" defaultValue={q.folder}>
            <option value="">All folders</option>
            <option value="/">Root only</option>
            {folders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        {tags.length > 0 && (
          <div className="adm-field">
            <label className="adm-label" htmlFor="media-tag">Tag</label>
            <select id="media-tag" className="adm-input adm-select" name="tag" defaultValue={q.tag}>
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        <div className="adm-actions">
          <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm">Apply</button>
          {filtered && <Link className="adm-btn adm-btn-ghost adm-btn-sm" href={href(base, { q: "", folder: "", tag: "", page: 1 })}>Reset</Link>}
        </div>
      </form>
      <div className="adm-table-foot" style={{ marginBlockEnd: 12 }}>
        <span>{total === 0 ? "No files" : `${total} file${total === 1 ? "" : "s"}`}{filtered ? " match" : ""}</span>
        <div className="adm-actions">
          <div className="adm-segment" role="group" aria-label="Sort">
            {(["newest", "oldest", "name"] as const).map((s) => (
              <Link key={s} href={href(base, { sort: s, page: 1 })} aria-current={q.sort === s ? "true" : undefined} className="adm-btn adm-btn-ghost adm-btn-sm">
                {s === "newest" ? "Newest" : s === "oldest" ? "Oldest" : "Name"}
              </Link>
            ))}
          </div>
          <div className="adm-segment" role="group" aria-label="View">
            <Link href={href(base, { view: "grid" })} aria-current={q.view === "grid" ? "true" : undefined} className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" aria-label="Grid view"><Icon name="grid" /></Link>
            <Link href={href(base, { view: "list" })} aria-current={q.view === "list" ? "true" : undefined} className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" aria-label="List view"><Icon name="list" /></Link>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="adm-card">
          <EmptyState
            icon="media"
            level={2}
            title={total === 0 && !filtered ? "The library is empty" : "No files match"}
            body={total === 0 && !filtered ? (canWrite ? "Drop images above to add them. Give each one alt text and it can be attached to a post." : "Nothing has been uploaded yet.") : "Try another search or clear the filters."}
          />
        </div>
      ) : (
        <MediaBrowser csrf={csrf} items={items} view={q.view} canWrite={canWrite} folders={folders} />
      )}
      <div className="adm-table-foot">
        <span />
        <Pagination basePath="/admin/media" params={tableParams} total={total} />
      </div>
    </>
  );
}
