import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentEntries } from "@/db/schema";
import { repoQuery } from "./util";

// Generic reader for the content_entries table: site content mirrored from the
// typed src/lib files as one jsonb row per entity+key, ordered like the source
// arrays. Each concrete repo module (services, industries, ...) wraps this with
// its own type and file fallback.

export async function getEntityList<T>(opts: {
  entity: string;
  tag: string;
  fallback: () => T[];
}): Promise<T[]> {
  return repoQuery({
    keys: ["repo", "content", opts.entity, "list"],
    tags: ["content", opts.tag],
    query: async () => {
      const rows = await getDb()
        .select({ data: contentEntries.data })
        .from(contentEntries)
        .where(eq(contentEntries.entity, opts.entity))
        .orderBy(asc(contentEntries.sortOrder));
      if (rows.length === 0) throw new Error(`no ${opts.entity} rows seeded`);
      return rows.map((r) => r.data as T);
    },
    fallback: opts.fallback,
  });
}

export async function getEntityByKey<T>(opts: {
  entity: string;
  key: string;
  tag: string;
  fallback: () => T | undefined;
}): Promise<T | undefined> {
  return repoQuery({
    keys: ["repo", "content", opts.entity, "by-key", opts.key],
    tags: ["content", opts.tag],
    query: async () => {
      const rows = await getDb()
        .select({ key: contentEntries.key, data: contentEntries.data })
        .from(contentEntries)
        .where(eq(contentEntries.entity, opts.entity))
        .orderBy(asc(contentEntries.sortOrder));
      // Empty table means "not seeded yet", which is a fallback case, not a 404.
      if (rows.length === 0) throw new Error(`no ${opts.entity} rows seeded`);
      const match = rows.find((r) => r.key === opts.key);
      return match ? (match.data as T) : undefined;
    },
    fallback: opts.fallback,
  });
}
