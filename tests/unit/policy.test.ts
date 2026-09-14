import { describe, expect, it } from "vitest";
import { mfaRequiredUnder, mustEnrol, secondFactorAsked, stillPending } from "@/lib/auth/policy";
import { MFA_POLICIES, mfaPolicySchema, DEFAULT_MFA_POLICY } from "@/lib/schemas/security";
import { ROLES } from "@/lib/auth/rbac";

// The second-factor policy rules: who must enrol, who is asked, and what a
// waiting session does when the policy is switched off underneath it.

describe("second factor policy", () => {
  it("defaults to optional and accepts only the four levels", () => {
    expect(DEFAULT_MFA_POLICY).toEqual({ mfa: "optional" });
    expect(MFA_POLICIES).toEqual(["off", "optional", "admins", "everyone"]);
    expect(mfaPolicySchema.safeParse({ mfa: "admins" }).success).toBe(true);
    expect(mfaPolicySchema.safeParse({ mfa: "always" }).success).toBe(false);
    expect(mfaPolicySchema.safeParse({}).success).toBe(false);
  });

  it("required: nobody under off and optional, Owner and Admin under admins, all under everyone", () => {
    const table = ROLES.map((role) => [role, mfaRequiredUnder("off", role), mfaRequiredUnder("optional", role), mfaRequiredUnder("admins", role), mfaRequiredUnder("everyone", role)]);
    expect(table).toEqual([
      ["owner", false, false, true, true],
      ["admin", false, false, true, true],
      ["editor", false, false, false, true],
      ["viewer", false, false, false, true],
    ]);
  });

  it("asks anyone who set an authenticator up, except when the policy is off", () => {
    expect(secondFactorAsked("optional", true)).toBe(true);
    expect(secondFactorAsked("admins", true)).toBe(true);
    expect(secondFactorAsked("everyone", true)).toBe(true);
    expect(secondFactorAsked("off", true)).toBe(false);
    expect(secondFactorAsked("optional", false)).toBe(false);
    expect(secondFactorAsked("everyone", false)).toBe(false);
  });

  it("sends people to enrol only when their role requires it and they have not", () => {
    expect(mustEnrol("optional", { role: "owner", totpEnabled: false })).toBe(false);
    expect(mustEnrol("admins", { role: "owner", totpEnabled: false })).toBe(true);
    expect(mustEnrol("admins", { role: "owner", totpEnabled: true })).toBe(false);
    expect(mustEnrol("admins", { role: "editor", totpEnabled: false })).toBe(false);
    expect(mustEnrol("everyone", { role: "viewer", totpEnabled: false })).toBe(true);
    expect(mustEnrol("off", { role: "owner", totpEnabled: false })).toBe(false);
  });

  it("lets a session that was waiting for the code through once the policy is off, and holds it otherwise", () => {
    expect(stillPending("off", true)).toBe(false);
    expect(stillPending("optional", true)).toBe(true);
    expect(stillPending("admins", false)).toBe(false);
  });
});
