import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaBand } from "@/components/CtaBand";
import { JobApplicationForm } from "@/components/JobApplicationForm";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { buildJobPosting, validateJobPosting } from "@/lib/jobposting";
import { EMPLOYMENT_TYPES, labelFor, officeByCode, REMOTE_POLICIES, salaryParts, SENIORITIES } from "@/lib/jobs-shared";
import { markdownToHtml, renderMarkdown } from "@/lib/markdown";
import { OG_IMAGE, withSeoOverride } from "@/lib/meta";
import { formatDate } from "@/lib/posts";
import { getOpenJob } from "@/lib/repo/jobs";
import { plainExcerpt } from "@/lib/slug";

// Public job detail (brief §3.4). Only open roles inside their window render;
// drafts, paused and closed roles, and unknown slugs, all fall through to the
// segment's not-found page with a 404 (documented choice: the App Router
// cannot emit 410 from a page, and a 404 keeps drafts unprobeable).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await getOpenJob(slug);
  if (!job) return {};
  const title = job.seo.metaTitle ?? job.title;
  const description = job.seo.metaDescription ?? plainExcerpt(job.summaryMd, 155);
  const path = `/jobs/${job.slug}`;
  return withSeoOverride(path, {
    title,
    description,
    ...(job.seo.noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: job.seo.canonical ?? path },
    openGraph: { type: "website", siteName: "DevelMo", url: path, title: `${title} | DevelMo`, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} | DevelMo`, description, images: [OG_IMAGE.url] },
  });
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getOpenJob(slug);
  if (!job) notFound();
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const office = officeByCode(job.officeCode);

  const [summary, responsibilities, requirements, benefits] = await Promise.all([
    renderMarkdown(job.summaryMd),
    job.responsibilitiesMd ? renderMarkdown(job.responsibilitiesMd) : null,
    job.requirementsMd ? renderMarkdown(job.requirementsMd) : null,
    job.benefitsMd ? renderMarkdown(job.benefitsMd) : null,
  ]);

  // JobPosting description is the whole posting as sanitized HTML.
  const descriptionMd = [
    job.summaryMd,
    job.responsibilitiesMd && `## What you will do\n\n${job.responsibilitiesMd}`,
    job.requirementsMd && `## What we are looking for\n\n${job.requirementsMd}`,
    job.benefitsMd && `## What we offer\n\n${job.benefitsMd}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ld = buildJobPosting({ ...job, validThrough: job.closesAt }, await markdownToHtml(descriptionMd));
  const report = validateJobPosting(ld);

  const salary = salaryParts(job);
  const salaryText = salary
    ? salary.max
      ? tr("{min} to {max} {period}").replace("{min}", salary.min ?? "").replace("{max}", salary.max).replace("{period}", tr(salary.period))
      : `${salary.min} ${tr(salary.period)}`
    : tr("Competitive");
  const meta = [job.department, job.location || (office ? tr(office.name) : ""), tr(labelFor(EMPLOYMENT_TYPES, job.employmentType))].filter(Boolean).join(" · ");
  const facts: { label: string; value: string }[] = [
    { label: "Office", value: office ? tr(office.name) + (job.location ? `, ${job.location}` : "") : job.location },
    { label: "Employment type", value: tr(labelFor(EMPLOYMENT_TYPES, job.employmentType)) },
    { label: "Seniority", value: job.seniority ? tr(labelFor(SENIORITIES, job.seniority)) : "" },
    { label: "Work arrangement", value: tr(labelFor(REMOTE_POLICIES, job.remotePolicy)) },
    { label: "Salary", value: salaryText },
    { label: "Applications close", value: job.closesAt ? formatDate(job.closesAt.slice(0, 10)) : "" },
  ].filter((f) => f.value);

  return (
    <>
      <PageHero
        title={job.title}
        subtitle={meta}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Careers", href: "/jobs" },
          { label: job.title },
        ]}
      />

      <section className="section">
        <div className="container contact-grid">
          <div>
            <div className="kicker">{tr("About this role")}</div>
            <div className="prose" style={{ marginTop: 14 }}>{summary}</div>
            {responsibilities && (
              <>
                <div className="kicker" style={{ marginTop: 40 }}>{tr("What you will do")}</div>
                <div className="prose" style={{ marginTop: 14 }}>{responsibilities}</div>
              </>
            )}
            {requirements && (
              <>
                <div className="kicker" style={{ marginTop: 40 }}>{tr("What we are looking for")}</div>
                <div className="prose" style={{ marginTop: 14 }}>{requirements}</div>
              </>
            )}
            {benefits && (
              <>
                <div className="kicker" style={{ marginTop: 40 }}>{tr("What we offer")}</div>
                <div className="prose" style={{ marginTop: 14 }}>{benefits}</div>
              </>
            )}
          </div>
          <div className="contact-info">
            <div className="blk">
              <h4>{tr("Role details")}</h4>
            </div>
            {facts.map((f) => (
              <div className="blk" key={f.label}>
                <h4>{tr(f.label)}</h4>
                <p>{f.value}</p>
              </div>
            ))}
            <div className="blk">
              <a href="#apply" className="btn btn-teal">{tr("Apply")}</a>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-light" id="apply">
        <div className="container">
          <div className="kicker">{tr("Apply")}</div>
          <h2 className="h2">{tr("Apply for this role")}</h2>
          <div style={{ maxWidth: 760, marginTop: 30 }}>
            <JobApplicationForm jobSlug={job.slug} locale={locale} />
          </div>
        </div>
      </section>

      <CtaBand
        title={
          <>
            Think you would <span className="hl">fit</span> here?
          </>
        }
        titleText="Think you would fit here?"
        text="Tell us what you have built and where you want to grow. We read every message."
      />
      {report.errors.length === 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      )}
    </>
  );
}
