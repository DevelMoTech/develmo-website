import { products as fileProducts, type Product } from "@/lib/products";
import { getEntityByKey, getEntityList } from "./content";

export type { Product };

// Products the site no longer offers. Dropping one from the typed file is not
// enough on its own: the database wins over that file, the content editor has
// no way to delete a whole entry, and nothing prunes a row when the code
// stops shipping it. Without this list a withdrawn product would keep
// appearing on a deployed site until someone ran SQL by hand. The rows can be
// deleted whenever; this is what makes the withdrawal take effect at once.
const WITHDRAWN = new Set(["omni-road"]);

export async function getProducts(): Promise<Product[]> {
  const all = await getEntityList<Product>({ entity: "product", tag: "products", fallback: () => fileProducts });
  return all.filter((p) => !WITHDRAWN.has(p.slug));
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  if (WITHDRAWN.has(slug)) return undefined;
  return getEntityByKey<Product>({
    entity: "product",
    key: slug,
    tag: "products",
    fallback: () => fileProducts.find((p) => p.slug === slug),
  });
}
