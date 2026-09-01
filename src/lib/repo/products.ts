import { products as fileProducts, type Product } from "@/lib/products";
import { getEntityByKey, getEntityList } from "./content";

export type { Product };

export async function getProducts(): Promise<Product[]> {
  return getEntityList<Product>({ entity: "product", tag: "products", fallback: () => fileProducts });
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  return getEntityByKey<Product>({
    entity: "product",
    key: slug,
    tag: "products",
    fallback: () => fileProducts.find((p) => p.slug === slug),
  });
}
