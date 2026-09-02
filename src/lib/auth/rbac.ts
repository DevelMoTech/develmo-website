// Role based access control (brief §3.1). Pure functions, no I/O, unit tested.
// Enforced on the server in every route handler and page; hiding UI is extra.

export const ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "content:read",
  "content:write",
  "media:read",
  "media:write",
  "submissions:read",
  "submissions:write",
  "seo:read",
  "seo:write",
  "security:read",
  "security:write",
  "performance:read",
  "performance:write",
  "users:read",
  "users:manage",
  "settings:read",
  "settings:write",
  // Settings the brief marks owner only, and changes to Owner accounts.
  "settings:owner",
  "owner:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const READS = new Set<Permission>(PERMISSIONS.filter((p) => p.endsWith(":read")));

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  // Everything, including user management, role changes, security settings
  // and destructive deletes.
  owner: ALL,
  // Everything except changing Owner accounts and the owner-only settings.
  admin: new Set([...ALL].filter((p) => p !== "settings:owner" && p !== "owner:manage")),
  // Content: posts, jobs, media, site content, translations, per page SEO.
  // Read only on submissions. No user, security or settings access.
  editor: new Set<Permission>([
    "content:read",
    "content:write",
    "media:read",
    "media:write",
    "seo:read",
    "seo:write",
    "submissions:read",
  ]),
  // Read only everywhere, including submissions. No mutations at all.
  viewer: READS,
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// TOTP is mandatory for Owner and Admin.
export function mfaRequired(role: Role): boolean {
  return role === "owner" || role === "admin";
}

// Whether `actor` may set `target`'s role to `next`. Owners cannot be demoted by
// anyone else; an Owner may step down only if another Owner remains.
export function canChangeRole(opts: {
  actorRole: Role;
  actorIsTarget: boolean;
  targetRole: Role;
  next: Role;
  ownerCount: number;
}): boolean {
  const { actorRole, actorIsTarget, targetRole, next, ownerCount } = opts;
  if (targetRole === next) return false;
  if (targetRole === "owner" || next === "owner") {
    // Only an Owner touches Owner accounts, and only their own demotion,
    // never while they are the last Owner.
    if (actorRole !== "owner") return false;
    if (targetRole === "owner" && !actorIsTarget) return false;
    if (targetRole === "owner" && ownerCount <= 1) return false;
    return true;
  }
  return can(actorRole, "users:manage");
}

// Whether `actor` may deactivate or delete `target`.
export function canRemoveUser(opts: {
  actorRole: Role;
  actorIsTarget: boolean;
  targetRole: Role;
  ownerCount: number;
}): boolean {
  const { actorRole, actorIsTarget, targetRole, ownerCount } = opts;
  if (targetRole === "owner") {
    // An Owner can only be removed by themselves, and never the last one.
    return actorRole === "owner" && actorIsTarget && ownerCount > 1;
  }
  if (actorIsTarget) return false;
  return can(actorRole, "users:manage");
}

// Which roles an actor may hand out in an invite.
export function invitableRoles(actorRole: Role): Role[] {
  if (actorRole === "owner") return [...ROLES];
  if (actorRole === "admin") return ["admin", "editor", "viewer"];
  return [];
}
