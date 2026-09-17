import { describe, expect, it } from "vitest";
import { ADMIN_FLOOR, ADMIN_ONLY, EDITABLE_ROLES, OWNER_ONLY, gridFor, isShipped, lockedFor, resolvePermissions } from "@/lib/auth/role-access";
import { PERMISSIONS, ROLES, can } from "@/lib/auth/rbac";
import { DEFAULT_ROLE_ACCESS, roleAccessSchema, type RoleAccess } from "@/lib/schemas/security";

// The editable permission grid: what a saved answer means once the rules that
// keep the console recoverable, and honest about who is an administrator,
// have been applied.

const grid = (roles: Partial<RoleAccess["roles"]>, known: RoleAccess["known"] = [...PERMISSIONS]): RoleAccess => ({
  roles: { admin: [], editor: [], viewer: [], ...roles },
  known,
});
const empty = grid({});

describe("the shipped default", () => {
  it("is exactly the fixed matrix, minus the Owner", () => {
    expect(EDITABLE_ROLES).toEqual(["admin", "editor", "viewer"]);
    for (const role of EDITABLE_ROLES) {
      const saved = new Set(DEFAULT_ROLE_ACCESS.roles[role]);
      const fixed = new Set(PERMISSIONS.filter((p) => can(role, p)));
      expect([...saved].sort(), role).toEqual([...fixed].sort());
    }
    expect(isShipped(DEFAULT_ROLE_ACCESS)).toBe(true);
    expect(isShipped(empty)).toBe(false);
  });

  it("resolves to the fixed matrix, so nothing changes until somebody edits it", () => {
    for (const role of ROLES) {
      const resolved = [...resolvePermissions(DEFAULT_ROLE_ACCESS, role)].sort();
      const fixed = PERMISSIONS.filter((p) => can(role, p)).sort();
      expect(resolved, role).toEqual(fixed);
    }
  });

  it("drops a name it does not recognise instead of refusing the whole grid", () => {
    const parsed = roleAccessSchema.safeParse({ roles: { admin: ["users:read", "retired:permission"], editor: [], viewer: [] } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.roles.admin).toEqual(["users:read"]);
    // A grid missing a whole role is still refused: that is a broken payload.
    expect(roleAccessSchema.safeParse({ roles: { admin: [], editor: [] } }).success).toBe(false);
  });
});

describe("resolving a saved grid", () => {
  it("gives the Owner everything, whatever the grid says", () => {
    for (const access of [empty, DEFAULT_ROLE_ACCESS]) {
      expect([...resolvePermissions(access, "owner")].sort()).toEqual([...PERMISSIONS].sort());
    }
  });

  it("keeps the Admin floor even when the grid is empty, and nothing else", () => {
    const admin = resolvePermissions(empty, "admin");
    for (const p of ADMIN_FLOOR) expect(admin.has(p), p).toBe(true);
    expect(admin.size).toBe(ADMIN_FLOOR.length);
  });

  it("refuses the owner only permissions to everyone but the Owner", () => {
    const greedy = grid({ admin: [...PERMISSIONS], editor: [...PERMISSIONS], viewer: [...PERMISSIONS] });
    for (const role of EDITABLE_ROLES) {
      for (const p of OWNER_ONLY) expect(resolvePermissions(greedy, role).has(p), `${role} ${p}`).toBe(false);
    }
    expect(resolvePermissions(greedy, "owner").has("owner:manage")).toBe(true);
  });

  it("will not quietly promote an Editor or a Viewer to an administrator", () => {
    const greedy = grid({ editor: [...PERMISSIONS], viewer: [...PERMISSIONS] });
    for (const role of ["editor", "viewer"] as const) {
      for (const p of ADMIN_ONLY) expect(resolvePermissions(greedy, role).has(p), `${role} ${p}`).toBe(false);
    }
    // Admin still has them, from the floor.
    for (const p of ADMIN_ONLY) expect(resolvePermissions(empty, "admin").has(p), p).toBe(true);
  });

  it("takes away what was unticked", () => {
    const access = grid({ editor: ["content:read", "media:write"], viewer: ["audit:read"] });
    expect([...resolvePermissions(access, "viewer")]).toEqual(["audit:read"]);
    expect(resolvePermissions(access, "editor").has("submissions:read")).toBe(false);
    expect(can("editor", "submissions:read")).toBe(true);
  });

  it("gives a role something the shipped matrix withholds, when that is not an administrator power", () => {
    const access = grid({ editor: ["security:read"] });
    expect(resolvePermissions(access, "editor").has("security:read")).toBe(true);
    expect(can("editor", "security:read")).toBe(false);
  });

  it("adds the matching view to every edit, because the page that offers it sits behind the view", () => {
    const access = grid({ editor: ["content:write", "media:write", "seo:write"] });
    const editor = resolvePermissions(access, "editor");
    for (const p of ["content:read", "media:read", "seo:read"] as const) expect(editor.has(p), p).toBe(true);
  });

  it("leaves a permission the grid never covered at its shipped answer", () => {
    // A grid saved before "audit:read" existed: it is absent from both the
    // saved list and the covered list, so the Viewer keeps the shipped yes.
    const covered = PERMISSIONS.filter((p) => p !== "audit:read");
    const access = grid({ viewer: ["content:read"] }, covered);
    expect(resolvePermissions(access, "viewer").has("audit:read")).toBe(true);
    // Once covered and unticked, it is genuinely gone.
    const later = grid({ viewer: ["content:read"] });
    expect(resolvePermissions(later, "viewer").has("audit:read")).toBe(false);
  });
});

describe("what the grid locks", () => {
  it("marks the owner only rows for every editable role, and the floor for Admin alone", () => {
    for (const role of EDITABLE_ROLES) {
      for (const p of OWNER_ONLY) expect(lockedFor(role, p), `${role} ${p}`).toBe("owner-only");
    }
    for (const p of ADMIN_FLOOR) {
      expect(lockedFor("admin", p), p).toBe("required");
    }
    expect(lockedFor("editor", "users:manage")).toBe("admin-only");
    expect(lockedFor("viewer", "settings:write")).toBe("admin-only");
    expect(lockedFor("editor", "users:read")).toBeNull();
    expect(lockedFor("admin", "content:write")).toBeNull();
  });

  it("the floor covers the pages that put a mistake right", () => {
    for (const p of ["users:manage", "security:write", "settings:write"] as const) expect(ADMIN_FLOOR).toContain(p);
  });
});

describe("gridFor", () => {
  it("answers for all three editable roles at once and leaves the Owner out", () => {
    const g = gridFor(DEFAULT_ROLE_ACCESS);
    expect(Object.keys(g).sort()).toEqual(["admin", "editor", "viewer"]);
    expect(g.admin.has("users:manage")).toBe(true);
    expect(g.viewer.has("content:write")).toBe(false);
    expect(ROLES).toContain("owner");
  });
});
