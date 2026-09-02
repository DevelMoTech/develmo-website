import type { JobRow } from "@/lib/admin/jobs";
import type { JobStatus } from "@/lib/jobs-shared";

// Shape shared by the server page (which builds it) and the client editor.
export type JobEditorValue = {
  title: string;
  slug: string;
  department: string;
  location: string;
  officeCode: string | null;
  employmentType: string;
  seniority: string;
  remotePolicy: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  hideSalary: boolean;
  summaryMd: string;
  responsibilitiesMd: string;
  requirementsMd: string;
  benefitsMd: string;
  // ISO timestamps or null; shown as datetime-local in the browser's zone.
  opensAt: string | null;
  closesAt: string | null;
  status: JobStatus;
  metaTitle: string;
  metaDescription: string;
  canonicalOverride: string;
  noindex: boolean;
};

export function blankJobValue(): JobEditorValue {
  return {
    title: "",
    slug: "",
    department: "",
    location: "",
    officeCode: "UK",
    employmentType: "full-time",
    seniority: "",
    remotePolicy: "hybrid",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "GBP",
    salaryPeriod: "year",
    hideSalary: false,
    summaryMd: "",
    responsibilitiesMd: "",
    requirementsMd: "",
    benefitsMd: "",
    opensAt: null,
    closesAt: null,
    status: "draft",
    metaTitle: "",
    metaDescription: "",
    canonicalOverride: "",
    noindex: false,
  };
}

export function jobEditorValue(row: JobRow): JobEditorValue {
  return {
    title: row.title,
    slug: row.slug,
    department: row.department,
    location: row.location,
    officeCode: row.officeCode,
    employmentType: row.employmentType,
    seniority: row.seniority,
    remotePolicy: row.remotePolicy,
    salaryMin: row.salaryMin === null ? "" : String(row.salaryMin),
    salaryMax: row.salaryMax === null ? "" : String(row.salaryMax),
    salaryCurrency: row.salaryCurrency,
    salaryPeriod: row.salaryPeriod,
    hideSalary: row.hideSalary,
    summaryMd: row.summaryMd,
    responsibilitiesMd: row.responsibilitiesMd,
    requirementsMd: row.requirementsMd,
    benefitsMd: row.benefitsMd,
    opensAt: row.opensAt?.toISOString() ?? null,
    closesAt: row.closesAt?.toISOString() ?? null,
    status: row.status,
    metaTitle: row.metaTitle ?? "",
    metaDescription: row.metaDescription ?? "",
    canonicalOverride: row.canonicalOverride ?? "",
    noindex: row.noindex,
  };
}
