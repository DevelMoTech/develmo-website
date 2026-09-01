import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { services } from "@/lib/services";
import { industries } from "@/lib/industries";
import { products } from "@/lib/products";
import { posts } from "@/lib/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url;
  const now = new Date();

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
