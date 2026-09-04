import type { Metadata } from "next";
import { ContentNav } from "@/app/(admin)/_components/content/ContentNav";
import { Card, CardLink, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { contentCounts } from "@/lib/admin/content";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Site content" };

const TILES = [
  { entity: "service", label: "Services", href: "/admin/content/services", hint: "Titles, blurbs, capabilities, outcomes and FAQs" },
  { entity: "industry", label: "Industries", href: "/admin/content/industries", hint: "Challenges, approaches, solutions and FAQs" },
  { entity: "product", label: "Products", href: "/admin/content/products", hint: "Taglines, features, how it works and FAQs" },
  { entity: "about", label: "About pages", href: "/admin/content/about", hint: "Vision, mission, story, values" },
] as const;

export default async function ContentPage() {
  await requirePageUser("/admin/content", { permission: "content:read" });
  const counts = await contentCounts();
  const seeded = Object.values(counts).some((c) => !c.fromFile);

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Site content"
        description="The structured content behind the public pages. Edited here, served through the repository layer, with the typed files in src/lib as the fallback."
      />
      <ContentNav />
      <div className="adm-grid adm-grid-tight" style={{ marginBlockStart: 18 }}>
        {TILES.map((t) => (
          <CardLink key={t.entity} href={t.href}>
            <div className="adm-tile">
              <div className="adm-tile-top">{t.label}</div>
              <div className="adm-tile-value">{counts[t.entity].rows}</div>
              <div className="adm-tile-sub">{counts[t.entity].fromFile ? "from the file, not yet seeded" : t.hint}</div>
            </div>
          </CardLink>
        ))}
      </div>
      <Card title="How an edit reaches the site" description="So the next person knows what to expect.">
        <dl className="adm-dl">
          <dt>Where it is stored</dt>
          <dd>One row per entry in the database. The typed file in src/lib stays as the seed and the fallback, and is never written to.</dd>
          <dt>When it appears</dt>
          <dd>On the next request. Saving invalidates the cache tag the public pages read through.</dd>
          <dt>What is protected</dt>
          <dd>Each form matches the shape its type declares, so the optional parts stay optional. FAQs need both a question and an answer, because they become the page&apos;s FAQPage structured data.</dd>
          <dt>Language</dt>
          <dd>Content is written in English. New wording renders in English on the other locales until it is translated under <a className="adm-link" href="/admin/translations">Translations</a>.</dd>
        </dl>
      </Card>
      {!seeded && (
        <Card
          title="Not seeded yet"
          description="Nothing has been written to the database for this content, so the public site is reading the typed files. The editors show those files and saving writes the first row."
        />
      )}
    </>
  );
}
