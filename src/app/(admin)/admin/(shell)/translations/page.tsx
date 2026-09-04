import type { Metadata } from "next";
import { LeakCheck } from "@/app/(admin)/_components/content/LeakCheck";
import { TranslationGrid } from "@/app/(admin)/_components/content/TranslationGrid";
import { Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { grid, LEAK_ROUTES, parseGridParams } from "@/lib/admin/translations";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { localeLabels } from "@/lib/i18n";

export const metadata: Metadata = { title: "Translations" };

// The translations manager (brief §3.9): the same dictionary space as
// extra.ts, with coverage per locale, a missing keys view, search and inline
// editing. Saved values go to the database; the files stay the seed and the
// fallback and are never written to.
export default async function TranslationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/translations", { permission: "content:read" });
  const params = parseGridParams(await searchParams);
  const [csrf, data] = await Promise.all([getCsrfToken(), grid(params)]);
  const canWrite = can(user.role, "content:write");

  return (
    <>
      <PageHeader
        kicker="Site content"
        title="Translations"
        description="Every string the public site translates, across the four non-English locales. An entry saved here overrides the generated files at runtime; the files stay as the seed and the fallback."
      />
      <Card title="Coverage" description={`${data.coverage[0]?.total ?? 0} keys in the dictionary. A key counts as covered when either the files or an override supplies a value.`}>
        <dl className="adm-dl">
          {data.coverage.map((c) => (
            <div key={c.locale} style={{ display: "contents" }}>
              <dt>{localeLabels[c.locale]}</dt>
              <dd>
                {c.percent}% covered, {c.translated} of {c.total}. {c.fromDatabase} edited here, {c.missing} missing.
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <TranslationGrid params={params} rows={data.rows} total={data.total} csrf={csrf} canWrite={canWrite} />
      <LeakCheck routes={LEAK_ROUTES} csrf={csrf} />
    </>
  );
}
