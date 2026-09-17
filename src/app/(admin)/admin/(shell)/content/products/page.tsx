import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { EntryEditor } from "@/app/(admin)/_components/content/EntryEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listEntries } from "@/lib/admin/content";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Products" };

// Editable Products (brief §3.9). The form mirrors the typed shape in
// src/lib, so the optional parts stay optional and the detail pages keep
// rendering and emitting their structured data.
export default async function ProductsContentPage() {
  const { allows } = await requirePageUser("/admin/content/products", { permission: "content:read" });
  const [csrf, entries] = await Promise.all([getCsrfToken(), listEntries("product")]);
  return (
    <>
      <PageHeader kicker="Site content" title="Products" description="Edited here, live on the public site on the next request. The typed file stays as the fallback." />
      <ContentNav />
      <EntryEditor entity="product" entries={entries} csrf={csrf} canWrite={allows("content:write")} pathPrefix="/our-products/" />
    </>
  );
}
