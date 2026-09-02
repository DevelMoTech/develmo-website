import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";
import { extraMessages } from "@/lib/i18n/extra";

export const metadata: Metadata = { title: "Translations" };

export default async function TranslationsPage() {
  await requirePageUser("/admin/translations", { permission: "content:read" });
  const c = await moduleCounts();
  const locales = ["ar", "ur", "fr", "es"] as const;
  return (
    <ModuleOverview
      kicker="Content"
      title="Translations"
      description="The supplementary UI dictionary. Database entries override the file at runtime; the file remains the seed and the fallback."
      icon="translate"
      stats={locales.map((l) => ({
        label: `${l.toUpperCase()} keys in file`,
        value: Object.keys(extraMessages[l] ?? {}).length,
        hint: `${c.translations[l] ?? 0} database overrides`,
      }))}
    />
  );
}
