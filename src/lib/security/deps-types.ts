// Shapes and constants for the dependency scan, with no Node imports, so
// the console's client components can use them without pulling the scanner
// (and node:fs) into the browser bundle.

export const SEVERITIES = ["critical", "high", "moderate", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Advisory = {
  package: string;
  installed: string[];
  severity: Severity;
  title: string;
  url: string;
  vulnerableVersions: string;
  cwe: string[];
  // Whether the dependency ships to production or is a build/test tool.
  dev: boolean;
};

export type DependencySummary = Record<Severity, number> & { packages: number; advisories: number };

export type DependencyReport = {
  summary: DependencySummary;
  advisories: Advisory[];
  source: string;
};

export function summarise(advisories: Advisory[], packages: number): DependencySummary {
  const summary = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, packages, advisories: advisories.length } as DependencySummary;
  for (const a of advisories) summary[a.severity] += 1;
  return summary;
}
