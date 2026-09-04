import { getSetting } from "@/lib/admin/settings";
import { repoQuery } from "@/lib/repo/util";
import { DEFAULT_MEDIA_SETTINGS, type MediaSettings } from "@/lib/schemas/performance";

// Hero media settings for the public home page (brief §3.8), through the
// repo cache like every other public read: tag-only invalidation, so the
// lookup is a memory hit after the first request and a save takes effect on
// the next one. With the database down the defaults apply, which are
// today's behaviour exactly.
export async function getMediaSettings(): Promise<MediaSettings> {
  return repoQuery<MediaSettings>({
    keys: ["repo", "media-settings"],
    tags: ["media-settings"],
    revalidate: false,
    query: () => getSetting("media"),
    fallback: () => DEFAULT_MEDIA_SETTINGS,
  });
}
