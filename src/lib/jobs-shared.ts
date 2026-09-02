import { site } from "@/lib/site";

// Job vocabulary shared by the editor, the public page and the JobPosting
// builder. `label` is the English UI string (translated with t() on the
// public page), `ld` is the schema.org value.

export const EMPLOYMENT_TYPES = [
  { value: "full-time", label: "Full-time", ld: "FULL_TIME" },
  { value: "part-time", label: "Part-time", ld: "PART_TIME" },
  { value: "contract", label: "Contract", ld: "CONTRACTOR" },
  { value: "internship", label: "Internship", ld: "INTERN" },
  { value: "temporary", label: "Temporary", ld: "TEMPORARY" },
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];

export const SENIORITIES = [
  { value: "", label: "Not specified" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
] as const;
export type Seniority = (typeof SENIORITIES)[number]["value"];

export const REMOTE_POLICIES = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number]["value"];

export const SALARY_PERIODS = [
  { value: "year", label: "per year", ld: "YEAR" },
  { value: "month", label: "per month", ld: "MONTH" },
  { value: "day", label: "per day", ld: "DAY" },
  { value: "hour", label: "per hour", ld: "HOUR" },
] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number]["value"];

export const CURRENCIES = ["GBP", "USD", "EUR", "AUD", "SAR", "PKR", "AED"] as const;

export const JOB_STATUSES = ["draft", "open", "paused", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// The offices in src/lib/site.ts, with the country data JobPosting needs.
export const OFFICES = site.offices.map((o) => ({
  code: o.code,
  name: o.name,
  country: ({ UK: "GB", AU: "AU", SA: "SA", PK: "PK" } as Record<string, string>)[o.code] ?? o.code,
  locality: o.code === "UK" ? site.address.city : "",
  region: o.code === "UK" ? site.address.region : "",
}));
export type OfficeCode = (typeof site.offices)[number]["code"];

export function officeByCode(code: string | null | undefined) {
  return OFFICES.find((o) => o.code === code) ?? null;
}

export function labelFor<T extends readonly { value: string; label: string }[]>(list: T, value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

export function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("en-GB")}`;
  }
}

// Structured salary for display; the caller supplies the words around it so
// the public page can translate them and the console can stay English.
export function salaryParts(job: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string; hideSalary: boolean }): { min: string | null; max: string | null; period: string } | null {
  if (job.hideSalary || (job.salaryMin === null && job.salaryMax === null)) return null;
  const period = labelFor(SALARY_PERIODS, job.salaryPeriod);
  const min = job.salaryMin !== null ? formatMoney(job.salaryMin, job.salaryCurrency) : null;
  const max = job.salaryMax !== null && job.salaryMax !== job.salaryMin ? formatMoney(job.salaryMax, job.salaryCurrency) : null;
  return { min: min ?? max, max: min ? max : null, period };
}
