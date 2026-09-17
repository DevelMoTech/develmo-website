import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { EntryEditor } from "@/app/(admin)/_components/content/EntryEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listEntries } from "@/lib/admin/content";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "About" };

// Editable About (brief §3.9). The form mirrors the typed shape in
// src/lib, so the optional parts stay optional and the detail pages keep
// rendering and emitting their structured data.
export default async function AboutContentPage() {
  const { allows } = await requirePageUser("/admin/content/about", { permission: "content:read" });
  const [csrf, entries] = await Promise.all([getCsrfToken(), listEntries("about")]);
  return (
    <>
      <PageHeader kicker="Site content" title="About" description="Edited here, live on the public site on the next request. The typed file stays as the fallback." />
      <ContentNav />
      <EntryEditor entity="about" entries={entries} csrf={csrf} canWrite={allows("content:write")}  />
    </>
  );
}
