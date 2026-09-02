import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can, canChangeRole, canRemoveUser, invitableRoles, mfaRequired, type Permission, type Role } from "@/lib/auth/rbac";

const reads = PERMISSIONS.filter((p) => p.endsWith(":read"));
const writes = PERMISSIONS.filter((p) => !p.endsWith(":read"));

describe("RBAC matrix (brief §3.1)", () => {
  it("owner can do everything", () => {
    for (const p of PERMISSIONS) expect(can("owner", p), p).toBe(true);
  });

  it("admin can do everything except owner-only settings and Owner account changes", () => {
    for (const p of PERMISSIONS) {
      const expected = p !== "settings:owner" && p !== "owner:manage";
      expect(can("admin", p), p).toBe(expected);
    }
  });

  it("editor has content, media and SEO write, submissions read only, nothing else", () => {
    const allowed: Permission[] = ["content:read", "content:write", "media:read", "media:write", "seo:read", "seo:write", "submissions:read"];
    for (const p of PERMISSIONS) expect(can("editor", p), p).toBe(allowed.includes(p));
    expect(can("editor", "submissions:write")).toBe(false);
    expect(can("editor", "users:read")).toBe(false);
    expect(can("editor", "security:read")).toBe(false);
    expect(can("editor", "settings:read")).toBe(false);
  });

  it("viewer is read only everywhere, including submissions, with no mutations", () => {
    for (const p of reads) expect(can("viewer", p), p).toBe(true);
    for (const p of writes) expect(can("viewer", p), p).toBe(false);
    expect(can("viewer", "submissions:read")).toBe(true);
    expect(can("viewer", "audit:read")).toBe(true);
  });

  it("MFA is mandatory for owner and admin only", () => {
    expect(ROLES.map((r) => [r, mfaRequired(r)])).toEqual([
      ["owner", true],
      ["admin", true],
      ["editor", false],
      ["viewer", false],
    ]);
  });
});

describe("role change rules", () => {
  const base = { actorIsTarget: false, ownerCount: 2 };

  it("nobody but the owner themselves can demote an owner", () => {
    for (const actorRole of ROLES) {
      expect(canChangeRole({ ...base, actorRole, targetRole: "owner", next: "admin" }), actorRole).toBe(false);
    }
  });

  it("an owner may step down only when another owner remains", () => {
    expect(canChangeRole({ actorRole: "owner", actorIsTarget: true, targetRole: "owner", next: "admin", ownerCount: 2 })).toBe(true);
    expect(canChangeRole({ actorRole: "owner", actorIsTarget: true, targetRole: "owner", next: "admin", ownerCount: 1 })).toBe(false);
  });

  it("only owners can promote someone to owner", () => {
    expect(canChangeRole({ ...base, actorRole: "owner", targetRole: "admin", next: "owner" })).toBe(true);
    expect(canChangeRole({ ...base, actorRole: "admin", targetRole: "admin", next: "owner" })).toBe(false);
  });

  it("admins manage non-owner roles, editors and viewers manage nothing", () => {
    expect(canChangeRole({ ...base, actorRole: "admin", targetRole: "viewer", next: "editor" })).toBe(true);
    expect(canChangeRole({ ...base, actorRole: "editor", targetRole: "viewer", next: "editor" })).toBe(false);
    expect(canChangeRole({ ...base, actorRole: "viewer", targetRole: "viewer", next: "editor" })).toBe(false);
  });

  it("a no-op role change is rejected", () => {
    expect(canChangeRole({ ...base, actorRole: "owner", targetRole: "editor", next: "editor" })).toBe(false);
  });
});

describe("removal rules", () => {
  it("an owner can only be removed by themselves and never as the last owner", () => {
    expect(canRemoveUser({ actorRole: "owner", actorIsTarget: false, targetRole: "owner", ownerCount: 2 })).toBe(false);
    expect(canRemoveUser({ actorRole: "admin", actorIsTarget: false, targetRole: "owner", ownerCount: 2 })).toBe(false);
    expect(canRemoveUser({ actorRole: "owner", actorIsTarget: true, targetRole: "owner", ownerCount: 2 })).toBe(true);
    expect(canRemoveUser({ actorRole: "owner", actorIsTarget: true, targetRole: "owner", ownerCount: 1 })).toBe(false);
  });

  it("nobody removes themselves through user management unless they are an owner stepping down", () => {
    expect(canRemoveUser({ actorRole: "admin", actorIsTarget: true, targetRole: "admin", ownerCount: 1 })).toBe(false);
  });

  it("admins remove editors and viewers; editors and viewers remove nobody", () => {
    expect(canRemoveUser({ actorRole: "admin", actorIsTarget: false, targetRole: "editor", ownerCount: 1 })).toBe(true);
    expect(canRemoveUser({ actorRole: "editor", actorIsTarget: false, targetRole: "viewer", ownerCount: 1 })).toBe(false);
    expect(canRemoveUser({ actorRole: "viewer", actorIsTarget: false, targetRole: "viewer", ownerCount: 1 })).toBe(false);
  });
});

describe("invitable roles", () => {
  it("owners invite any role, admins never invite owners, others invite nobody", () => {
    expect(invitableRoles("owner")).toEqual<Role[]>(["owner", "admin", "editor", "viewer"]);
    expect(invitableRoles("admin")).toEqual<Role[]>(["admin", "editor", "viewer"]);
    expect(invitableRoles("editor")).toEqual([]);
    expect(invitableRoles("viewer")).toEqual([]);
  });
});
