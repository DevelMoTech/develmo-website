import { getSettingStrict } from "@/lib/admin/settings";
import { repoQuery } from "@/lib/repo/util";
import { DEFAULT_ROBOTS_BODY, renderRobots, ROBOTS_TAG } from "@/lib/seo/robots";

// robots.txt (brief §3.6). The body is editable at /admin/seo/robots and
// comes through the repo cache (tag-only invalidation, busted on save);
// renderRobots() applies the hard rule that /admin and /api/admin are
// disallowed in every group, whatever the body says.
//
// The route itself is dynamic so that a fallback (the pre-editor file,
// served while the database cannot be read) is never cached: it goes out
// with no-store, and the saved body is served again on the next request.
// The saved body is a data-cache hit, so this costs no query per request.

export const dynamic = "force-dynamic";

export async function GET() {
  const body = await repoQuery<string | null>({
    keys: ["repo", "seo", "robots"],
    tags: [ROBOTS_TAG],
    revalidate: false,
    query: async () => (await getSettingStrict("robots")).body,
    fallback: () => null,
  });
  const fallback = body === null;
  return new Response(renderRobots(body ?? DEFAULT_ROBOTS_BODY), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": fallback ? "no-store" : "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
