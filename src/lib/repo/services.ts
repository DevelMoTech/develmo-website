import {
  pillars as filePillars,
  services as fileServices,
  type Pillar,
  type Service,
} from "@/lib/services";
import { getEntityByKey, getEntityList } from "./content";

export type { Pillar, Service };

export async function getPillars(): Promise<Pillar[]> {
  return getEntityList<Pillar>({ entity: "pillar", tag: "services", fallback: () => filePillars });
}

export async function getServices(): Promise<Service[]> {
  return getEntityList<Service>({ entity: "service", tag: "services", fallback: () => fileServices });
}

export async function getServicesByPillar(pillarKey: string): Promise<Service[]> {
  const all = await getServices();
  return all.filter((s) => s.pillar === pillarKey);
}

export async function getService(slug: string): Promise<Service | undefined> {
  return getEntityByKey<Service>({
    entity: "service",
    key: slug,
    tag: "services",
    fallback: () => fileServices.find((s) => s.slug === slug),
  });
}

export async function getPillar(key: string): Promise<Pillar | undefined> {
  return getEntityByKey<Pillar>({
    entity: "pillar",
    key,
    tag: "services",
    fallback: () => filePillars.find((p) => p.key === key),
  });
}
