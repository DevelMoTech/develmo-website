import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { EntryEditor } from "@/app/(admin)/_components/content/EntryEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listEntries } from "@/lib/admin/content";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Services" };

// Editable Services (brief §3.9). The form mirrors the typed shape in
// src/lib, so the optional parts stay optional and the detail pages keep
// rendering and emitting their structured data.
export default async function ServicesContentPage() {
  const { user } = await requirePageUser("/admin/content/services", { permission: "content:read" });
  const [csrf, entries] = await Promise.all([getCsrfToken(), listEntries("service")]);
  return (
    <>
      <PageHeader kicker="Site content" title="Services" description="Edited here, live on the public site on the next request. The typed file stays as the fallback." />
      <ContentNav />
      <EntryEditor entity="service" entries={entries} csrf={csrf} canWrite={can(user.role, "content:write")} pathPrefix="/what-we-do/" />
    </>
  );
}
