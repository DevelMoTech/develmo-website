// Organization JSON-LD (brief §3.6): built from editable facts, validated
// before save and before it is emitted. Pure module: the editor previews with
// it, SiteChrome emits with it, the unit tests cover it.

import { site } from "@/lib/site";

export type OrganizationFacts = {
  name: string;
  email: string;
  description: string;
  streetAddress: string;
  addressLocality: string;
  postalCode: string;
  addressCountry: string;
  // Optional extras; empty means "not emitted", which keeps the default
  // output identical to the pre-editor markup.
  telephone: string[];
  logo: string;
};

export const DEFAULT_ORGANIZATION_FACTS: OrganizationFacts = {
  name: site.name,
  email: site.email,
  description: site.description,
  streetAddress: site.address.line,
  addressLocality: site.address.city,
  postalCode: site.address.postcode,
  addressCountry: "GB",
  telephone: [],
  logo: "",
};

export type OrganizationLd = Record<string, unknown>;

// Key order matters for byte identity with the markup the site shipped with.
export function buildOrganizationLd(facts: OrganizationFacts): OrganizationLd {
  const ld: OrganizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: facts.name,
    url: site.url,
    email: facts.email,
    description: facts.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: facts.streetAddress,
      addressLocality: facts.addressLocality,
      postalCode: facts.postalCode,
      addressCountry: facts.addressCountry,
    },
    // sameAs always points at the real profiles in src/lib/site.ts.
    sameAs: site.social.map((s) => s.href),
  };
  const phones = facts.telephone.map((t) => t.trim()).filter(Boolean);
  if (phones.length) ld.telephone = phones.length === 1 ? phones[0] : phones;
  if (facts.logo.trim()) ld.logo = facts.logo.trim();
  return ld;
}

export type OrganizationReport = { errors: string[]; warnings: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isHttps = (v: unknown): boolean => typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v);

export function validateOrganizationLd(ld: unknown): OrganizationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(ld)) return { errors: ["JSON-LD must be an object"], warnings };
  if (ld["@context"] !== "https://schema.org") errors.push("@context must be https://schema.org");
  if (ld["@type"] !== "Organization") errors.push("@type must be Organization");
  if (typeof ld.name !== "string" || !ld.name.trim()) errors.push("name is required");
  else if (ld.name.length > 120) errors.push("name is longer than 120 characters");
  if (!isHttps(ld.url)) errors.push("url must be an https URL");
  if (typeof ld.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ld.email)) errors.push("email must be a valid address");
  if (typeof ld.description !== "string" || !ld.description.trim()) errors.push("description is required");
  else if (ld.description.length > 5000) errors.push("description is longer than 5,000 characters");
  if (!isObj(ld.address) || ld.address["@type"] !== "PostalAddress") errors.push("address must be a PostalAddress");
  else {
    for (const key of ["streetAddress", "addressLocality", "postalCode", "addressCountry"] as const) {
      const v = ld.address[key];
      if (typeof v !== "string" || !v.trim()) errors.push(`address.${key} is required`);
    }
    const country = ld.address.addressCountry;
    if (typeof country === "string" && country.trim() && !/^[A-Z]{2}$/.test(country.trim())) warnings.push("addressCountry is usually the two letter ISO code, for example GB");
  }
  if (!Array.isArray(ld.sameAs) || ld.sameAs.length === 0) errors.push("sameAs must list the social profiles");
  else for (const s of ld.sameAs) if (!isHttps(s)) errors.push(`sameAs entry is not an https URL: ${String(s)}`);
  if (ld.telephone !== undefined) {
    const phones = Array.isArray(ld.telephone) ? ld.telephone : [ld.telephone];
    for (const p of phones) if (typeof p !== "string" || !/^\+?[\d\s().-]{6,25}$/.test(p)) errors.push(`telephone is not a phone number: ${String(p)}`);
  }
  if (ld.logo !== undefined && !isHttps(ld.logo)) errors.push("logo must be an https URL");
  else if (ld.logo === undefined) warnings.push("No logo: Google uses it for the knowledge panel");
  return { errors, warnings };
}
