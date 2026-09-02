import { EMPLOYMENT_TYPES, officeByCode, SALARY_PERIODS } from "@/lib/jobs-shared";
import { site } from "@/lib/site";

// schema.org JobPosting (brief §3.4): built from a job row and checked
// against Google's required and recommended properties before it ships. The
// public page only emits the script when `validateJobPosting` reports no
// errors, and the editor shows the same report so staff can fix the gaps.

export type JobPostingInput = {
  slug: string;
  title: string;
  department: string;
  location: string;
  officeCode: string | null;
  employmentType: string;
  remotePolicy: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  hideSalary: boolean;
  // ISO date (YYYY-MM-DD) and ISO datetime or null.
  datePosted: string;
  validThrough: string | null;
};

export type JobPostingLd = Record<string, unknown>;

export function buildJobPosting(job: JobPostingInput, descriptionHtml: string): JobPostingLd {
  const office = officeByCode(job.officeCode);
  const employment = EMPLOYMENT_TYPES.find((e) => e.value === job.employmentType);
  const ld: JobPostingLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: descriptionHtml,
    datePosted: job.datePosted,
    hiringOrganization: {
      "@type": "Organization",
      name: site.name,
      sameAs: site.url,
      logo: `${site.url}/develmo-logo.png`,
    },
    identifier: { "@type": "PropertyValue", name: site.name, value: job.slug },
    directApply: true,
    url: `${site.url}/jobs/${job.slug}`,
  };
  if (job.validThrough) ld.validThrough = job.validThrough;
  if (employment) ld.employmentType = employment.ld;
  if (job.department) ld.occupationalCategory = job.department;
  if (office) {
    const address: Record<string, string> = { "@type": "PostalAddress", addressCountry: office.country };
    const locality = job.location || office.locality;
    if (locality) address.addressLocality = locality;
    if (office.region) address.addressRegion = office.region;
    if (job.remotePolicy === "remote") {
      ld.jobLocationType = "TELECOMMUTE";
      ld.applicantLocationRequirements = { "@type": "Country", name: office.name };
    } else {
      ld.jobLocation = { "@type": "Place", address };
    }
  }
  if (!job.hideSalary && (job.salaryMin !== null || job.salaryMax !== null)) {
    const period = SALARY_PERIODS.find((p) => p.value === job.salaryPeriod)?.ld ?? "YEAR";
    const value: Record<string, unknown> = { "@type": "QuantitativeValue", unitText: period };
    if (job.salaryMin !== null && job.salaryMax !== null && job.salaryMin !== job.salaryMax) {
      value.minValue = job.salaryMin;
      value.maxValue = job.salaryMax;
    } else {
      value.value = job.salaryMin ?? job.salaryMax;
    }
    ld.baseSalary = { "@type": "MonetaryAmount", currency: job.salaryCurrency, value };
  }
  return ld;
}

export type JobPostingReport = { errors: string[]; warnings: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const EMPLOYMENT_LD = new Set<string>(EMPLOYMENT_TYPES.map((e) => e.ld));

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Required: title, description, datePosted, hiringOrganization, and either a
// jobLocation or TELECOMMUTE with applicantLocationRequirements. Recommended:
// validThrough, employmentType, baseSalary, identifier.
export function validateJobPosting(ld: unknown): JobPostingReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(ld)) return { errors: ["Structured data is not an object"], warnings };
  if (ld["@context"] !== "https://schema.org" || ld["@type"] !== "JobPosting") errors.push("@type must be JobPosting with the schema.org context");
  if (typeof ld.title !== "string" || !ld.title.trim()) errors.push("title is required");
  if (typeof ld.description !== "string" || ld.description.replace(/<[^>]+>/g, "").trim().length < 50) errors.push("description needs at least 50 characters of text");
  if (typeof ld.datePosted !== "string" || !ISO_DATE.test(ld.datePosted)) errors.push("datePosted must be an ISO 8601 date");
  const org = ld.hiringOrganization;
  if (!isObj(org) || org["@type"] !== "Organization" || typeof org.name !== "string" || !org.name) errors.push("hiringOrganization needs an Organization with a name");
  const loc = ld.jobLocation;
  const remote = ld.jobLocationType === "TELECOMMUTE";
  if (remote) {
    const req = ld.applicantLocationRequirements;
    if (!isObj(req) || req["@type"] !== "Country" || typeof req.name !== "string" || !req.name) errors.push("a remote role needs applicantLocationRequirements with a Country");
  } else {
    const address = isObj(loc) ? loc.address : null;
    if (!isObj(loc) || loc["@type"] !== "Place" || !isObj(address) || address["@type"] !== "PostalAddress" || typeof address.addressCountry !== "string" || !address.addressCountry) {
      errors.push("jobLocation needs a Place with a PostalAddress and addressCountry (choose an office)");
    }
  }
  if (ld.validThrough === undefined) warnings.push("validThrough is recommended (set a closing date)");
  else if (typeof ld.validThrough !== "string" || !ISO_DATE.test(ld.validThrough)) errors.push("validThrough must be an ISO 8601 date");
  if (ld.employmentType === undefined) warnings.push("employmentType is recommended");
  else if (typeof ld.employmentType !== "string" || !EMPLOYMENT_LD.has(ld.employmentType)) errors.push("employmentType must be one of the schema.org values");
  const salary = ld.baseSalary;
  if (salary === undefined) warnings.push("baseSalary is recommended (or the salary is hidden)");
  else {
    const value = isObj(salary) ? salary.value : null;
    const ok =
      isObj(salary) &&
      salary["@type"] === "MonetaryAmount" &&
      typeof salary.currency === "string" &&
      /^[A-Z]{3}$/.test(salary.currency) &&
      isObj(value) &&
      value["@type"] === "QuantitativeValue" &&
      typeof value.unitText === "string" &&
      (typeof value.value === "number" || (typeof value.minValue === "number" && typeof value.maxValue === "number" && value.minValue <= value.maxValue));
    if (!ok) errors.push("baseSalary must be a MonetaryAmount with an ISO currency and a QuantitativeValue");
  }
  if (!isObj(ld.identifier)) warnings.push("identifier is recommended");
  return { errors, warnings };
}
