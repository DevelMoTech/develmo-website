import { revalidateTag, unstable_cache } from "next/cache";
import { getSetting } from "@/lib/admin/settings";
import { ADMIN_FLOOR_PERMISSIONS, ADMIN_ONLY_PERMISSIONS, DEFAULT_ROLE_ACCESS, OWNER_ONLY_PERMISSIONS, type RoleAccess } from "@/lib/schemas/security";
import { PERMISSIONS, ROLES, can, type Permission, type Role } from "./rbac";

// Which console features each role may use, as set by an Owner or Admin under
// Security, Roles and access. The fixed matrix in rbac.ts is the shipped
// default and the shape of the grid; this is the saved answer on top of it.
//
// Read on every page render and every API call, so it goes through the shared
// data cache under a tag, exactly like the second-factor policy: a save
// expires the tag and the next request everywhere reads the new grid.

const TAG = "role-access";

// Owner is not in the grid at all. Somebody has to be able to undo a mistake
// made in the grid, and that somebody is the Owner.
export const EDITABLE_ROLES = ROLES.filter((r) => r !== "owner") as Exclude<Role, "owner">[];

// The rules the grid may not break live with the schema, so the form and the
// server read the same lists: never handed on by the Owner, never handed down
// to an Editor or a Viewer, and never taken away from an Admin.
export const OWNER_ONLY = OWNER_ONLY_PERMISSIONS;
export const ADMIN_FLOOR = ADMIN_FLOOR_PERMISSIONS;
export const ADMIN_ONLY = ADMIN_ONLY_PERMISSIONS;

export function lockedFor(role: Exclude<Role, "owner">, permission: Permission): "owner-only" | "admin-only" | "required" | null {
  if (OWNER_ONLY.includes(permission)) return "owner-only";
  if (role === "admin" && ADMIN_FLOOR.includes(permission)) return "required";
  if (role !== "admin" && ADMIN_ONLY.includes(permission)) return "admin-only";
  return null;
}

// What a saved grid actually means once the rules above are applied. Pure, so
// the page, the API and the tests all agree on the answer.
export function resolvePermissions(access: RoleAccess, role: Role): Set<Permission> {
  if (role === "owner") return new Set(PERMISSIONS);
  const known = new Set(access.known ?? PERMISSIONS);
  const saved = new Set(access.roles[role] ?? []);
  const out = new Set<Permission>();
  for (const p of PERMISSIONS) {
    // A permission the grid never covered keeps its shipped answer, so adding
    // one to the console does not quietly take it away from everybody.
    if (!(known.has(p) ? saved.has(p) : can(role, p))) continue;
    if (lockedFor(role, p)) continue;
    out.add(p);
  }
  // The locks, applied last so nothing above can undo them.
  if (role === "admin") for (const p of ADMIN_FLOOR) out.add(p);
  // A write without its read is a role that can change what it cannot open,
  // because every page that offers the change sits behind the read.
  for (const p of [...out]) {
    if (!p.endsWith(":write")) continue;
    const read = `${p.slice(0, -":write".length)}:read` as Permission;
    if ((PERMISSIONS as readonly string[]).includes(read)) out.add(read);
  }
  return out;
}

// The grid as the console should show it: every saved answer, with the
// locked rows forced to their true value.
export function gridFor(access: RoleAccess): Record<Exclude<Role, "owner">, Set<Permission>> {
  return {
    admin: resolvePermissions(access, "admin"),
    editor: resolvePermissions(access, "editor"),
    viewer: resolvePermissions(access, "viewer"),
  };
}

const readAccess = unstable_cache(async (): Promise<RoleAccess> => getSetting("role_access"), ["role-access"], { tags: [TAG], revalidate: 300 });

export async function getRoleAccess(): Promise<RoleAccess> {
  return readAccess();
}

export function bustRoleAccess(): void {
  revalidateTag(TAG, { expire: 0 });
}

export type Allows = (permission: Permission) => boolean;

// The permission set for one role, after the saved grid and the rules.
export async function permissionsFor(role: Role): Promise<Set<Permission>> {
  return resolvePermissions(await getRoleAccess(), role);
}

// A cheap synchronous test to hand to a page or a component, so one await at
// the gate covers every check the render then makes.
export async function allowsFor(role: Role): Promise<Allows> {
  const set = await permissionsFor(role);
  return (permission: Permission) => set.has(permission);
}

export async function allows(role: Role, permission: Permission): Promise<boolean> {
  return (await permissionsFor(role)).has(permission);
}

// True when the saved grid still matches what the console shipped with.
export function isShipped(access: RoleAccess): boolean {
  const base = DEFAULT_ROLE_ACCESS;
  return EDITABLE_ROLES.every((r) => {
    const a = new Set(access.roles[r] ?? []);
    const b = new Set(base.roles[r] ?? []);
    return a.size === b.size && [...a].every((p) => b.has(p));
  });
}
