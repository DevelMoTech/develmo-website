import { aboutContent as fileAbout, type AboutContent } from "@/lib/about";
import { getEntityByKey } from "./content";

export type { AboutContent };

export async function getAboutContent(key: string): Promise<AboutContent | undefined> {
  return getEntityByKey<AboutContent>({
    entity: "about",
    key,
    tag: "about",
    fallback: () => fileAbout[key],
  });
}
