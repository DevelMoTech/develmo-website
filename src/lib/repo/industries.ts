import { industries as fileIndustries, type Industry } from "@/lib/industries";
import { getEntityByKey, getEntityList } from "./content";

export type { Industry };

export async function getIndustries(): Promise<Industry[]> {
  return getEntityList<Industry>({
    entity: "industry",
    tag: "industries",
    fallback: () => fileIndustries,
  });
}

export async function getIndustry(slug: string): Promise<Industry | undefined> {
  return getEntityByKey<Industry>({
    entity: "industry",
    key: slug,
    tag: "industries",
    fallback: () => fileIndustries.find((i) => i.slug === slug),
  });
}
