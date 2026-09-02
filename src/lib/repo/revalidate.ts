import { revalidateTag } from "next/cache";

// On-demand revalidation for the posts entity. Route handlers must use the
// { expire: 0 } form (Next 16 docs, revalidateTag.md): "max" would keep
// serving the stale entry until the next visit, and updateTag is Server
// Action only. Every publish, unpublish, restore and cron flip calls this.
export function revalidatePosts(slugs: string[] = []): void {
  revalidateTag("posts", { expire: 0 });
  for (const slug of new Set(slugs)) revalidateTag(`post:${slug}`, { expire: 0 });
}
