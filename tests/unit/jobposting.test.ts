import { describe, expect, it } from "vitest";
import { buildJobPosting, validateJobPosting, type JobPostingInput } from "@/lib/jobposting";

const base: JobPostingInput = {
  slug: "senior-ml-engineer",
  title: "Senior ML Engineer",
  department: "Engineering",
  location: "London",
  officeCode: "UK",
  employmentType: "full-time",
  remotePolicy: "hybrid",
  salaryMin: 70000,
  salaryMax: 90000,
  salaryCurrency: "GBP",
  salaryPeriod: "year",
  hideSalary: false,
  datePosted: "2026-09-01",
  validThrough: "2026-10-01T00:00:00.000Z",
};
const description = "<p>" + "We are hiring an engineer to build production computer vision systems. ".repeat(2) + "</p>";

describe("buildJobPosting", () => {
  it("emits the required and recommended JobPosting properties", () => {
    const ld = buildJobPosting(base, description);
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Senior ML Engineer");
    expect(ld.datePosted).toBe("2026-09-01");
    expect(ld.validThrough).toBe("2026-10-01T00:00:00.000Z");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.hiringOrganization).toMatchObject({ "@type": "Organization", name: "DevelMo", sameAs: "https://develmo.com" });
    expect(ld.jobLocation).toEqual({ "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "GB", addressLocality: "London", addressRegion: "England" } });
    expect(ld.baseSalary).toEqual({ "@type": "MonetaryAmount", currency: "GBP", value: { "@type": "QuantitativeValue", unitText: "YEAR", minValue: 70000, maxValue: 90000 } });
    expect(ld.identifier).toEqual({ "@type": "PropertyValue", name: "DevelMo", value: "senior-ml-engineer" });
    expect(ld.directApply).toBe(true);
    expect(ld.url).toBe("https://develmo.com/jobs/senior-ml-engineer");
    expect(validateJobPosting(ld)).toEqual({ errors: [], warnings: [] });
  });

  it("describes remote roles with TELECOMMUTE and a country requirement", () => {
    const ld = buildJobPosting({ ...base, remotePolicy: "remote", officeCode: "PK", location: "" }, description);
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.applicantLocationRequirements).toEqual({ "@type": "Country", name: "Pakistan" });
    expect(ld.jobLocation).toBeUndefined();
    expect(validateJobPosting(ld).errors).toEqual([]);
  });

  it("uses a single value when min and max match, omits salary when hidden", () => {
    expect((buildJobPosting({ ...base, salaryMax: 70000 }, description).baseSalary as { value: { value: number } }).value.value).toBe(70000);
    expect(buildJobPosting({ ...base, hideSalary: true }, description).baseSalary).toBeUndefined();
    expect(buildJobPosting({ ...base, salaryMin: null, salaryMax: null }, description).baseSalary).toBeUndefined();
  });

  it("converts salary periods and employment types to schema.org values", () => {
    expect((buildJobPosting({ ...base, salaryPeriod: "hour", employmentType: "contract" }, description).baseSalary as { value: { unitText: string } }).value.unitText).toBe("HOUR");
    expect(buildJobPosting({ ...base, employmentType: "internship" }, description).employmentType).toBe("INTERN");
  });
});

describe("validateJobPosting", () => {
  it("fails without an office (no location) and reports it", () => {
    const ld = buildJobPosting({ ...base, officeCode: null }, description);
    const report = validateJobPosting(ld);
    expect(report.errors).toEqual(["jobLocation needs a Place with a PostalAddress and addressCountry (choose an office)"]);
  });

  it("fails on a short description, a bad date or a missing title", () => {
    expect(validateJobPosting(buildJobPosting(base, "<p>Short.</p>")).errors).toContain("description needs at least 50 characters of text");
    expect(validateJobPosting(buildJobPosting({ ...base, datePosted: "yesterday" }, description)).errors).toContain("datePosted must be an ISO 8601 date");
    expect(validateJobPosting(buildJobPosting({ ...base, title: "  " }, description)).errors).toContain("title is required");
  });

  it("warns, not fails, when recommended properties are absent", () => {
    const ld = buildJobPosting({ ...base, validThrough: null, hideSalary: true }, description);
    const report = validateJobPosting(ld);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual(["validThrough is recommended (set a closing date)", "baseSalary is recommended (or the salary is hidden)"]);
  });

  it("rejects malformed hand-built objects", () => {
    expect(validateJobPosting(null).errors).toEqual(["Structured data is not an object"]);
    expect(validateJobPosting({ "@context": "https://schema.org", "@type": "Article" }).errors[0]).toContain("@type must be JobPosting");
    const bad = { ...buildJobPosting(base, description), employmentType: "FULLTIME", baseSalary: { "@type": "MonetaryAmount", currency: "pounds", value: { "@type": "QuantitativeValue", unitText: "YEAR", minValue: 9, maxValue: 1 } } };
    const report = validateJobPosting(bad);
    expect(report.errors).toContain("employmentType must be one of the schema.org values");
    expect(report.errors).toContain("baseSalary must be a MonetaryAmount with an ISO currency and a QuantitativeValue");
  });
});
