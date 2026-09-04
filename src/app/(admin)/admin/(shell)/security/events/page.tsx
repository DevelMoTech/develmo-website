import type { Metadata } from "next";
import { EventsList } from "@/app/(admin)/_components/security/EventsList";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { tableHref } from "@/app/(admin)/_lib/table";
import { eventTypeOptions, fetchEvents, parseEventParams, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getSetting } from "@/lib/admin/settings";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Security events" };

// The event log (brief §3.7): every authentication and abuse event, with
// URL-backed filters, CSV export and the configured retention window.
export default async function SecurityEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("/admin/security/events", { permission: SECURITY_PERMISSION });
  const raw = await searchParams;
  const params = parseEventParams(raw);
  const [csrf, { rows, total }, types, retention] = await Promise.all([
    getCsrfToken(),
    fetchEvents(params, { limit: params.pageSize, offset: (params.page - 1) * params.pageSize }),
    eventTypeOptions(),
    getSetting("security_retention"),
  ]);
  const exportHref = tableHref("/api/admin/security/events/export", params, { page: 1 }, { sort: "createdAt", dir: "desc" });
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Events"
        description={retention.eventDays === 0 ? "Every authentication and abuse event, kept indefinitely." : `Every authentication and abuse event, kept for ${retention.eventDays} days. The audit log is separate and is never deleted.`}
      />
      <SecurityNav />
      <EventsList params={params} rows={rows} total={total} types={types} exportHref={exportHref} csrf={csrf} retention={retention} />
    </>
  );
}
