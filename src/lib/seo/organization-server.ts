import { repoQuery } from "@/lib/repo/util";
import { getSettingStrict } from "@/lib/admin/settings";
import { buildOrganizationLd, DEFAULT_ORGANIZATION_FACTS, validateOrganizationLd, type OrganizationLd } from "./organization";

export const SCHEMA_TAG = "schema";

// The Organization JSON-LD SiteChrome emits: the saved facts through the
// repo cache, the hardcoded facts as the fallback. A saved document that
// fails validation is never emitted; the default takes its place.
export async function getOrganizationLd(): Promise<OrganizationLd> {
  return repoQuery<OrganizationLd>({
    keys: ["repo", "seo", "organization"],
    tags: [SCHEMA_TAG],
    query: async () => {
      const facts = await getSettingStrict("org_schema");
      const ld = buildOrganizationLd(facts);
      return validateOrganizationLd(ld).errors.length === 0 ? ld : buildOrganizationLd(DEFAULT_ORGANIZATION_FACTS);
    },
    fallback: () => buildOrganizationLd(DEFAULT_ORGANIZATION_FACTS),
  });
}
