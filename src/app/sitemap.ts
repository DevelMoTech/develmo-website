import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { getServices } from "@/lib/repo/services";
import { getIndustries } from "@/lib/repo/industries";
import { getProducts } from "@/lib/repo/products";
import { getPosts } from "@/lib/repo/posts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url;
  const now = new Date();
  const services = await getServices();
  const industries = await getIndustries();
  const products = await getProducts();
  const posts = await getPosts("blog");

  const staticRoutes = [
    "",
    "/what-we-do",
    "/who-we-help",
    "/our-products",
    "/our-products/crowdiq",
    "/who-we-are",
    "/who-we-are/about-develmo",
    "/our-knowledge-base",
    "/our-blogs",
    "/jobs",
    "/contact-develmo",
    "/privacy",
    "/terms",
    "/cookies",
  ];

  const serviceRoutes = services.map((s) => `/what-we-do/${s.slug}`);
  const industryRoutes = industries.map((i) => `/who-we-help/${i.slug}`);
  const productRoutes = products
    .filter((p) => p.slug !== "crowdiq")
    .map((p) => `/our-products/${p.slug}`);
  const blogRoutes = posts.map((p) => `/our-blogs/${p.slug}`);

  return [...staticRoutes, ...serviceRoutes, ...industryRoutes, ...productRoutes, ...blogRoutes].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : path.startsWith("/our-blogs/") ? 0.6 : 0.7,
    }),
  );
}
