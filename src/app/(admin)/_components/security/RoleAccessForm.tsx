"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Permission, Role } from "@/lib/auth/rbac";
import { ADMIN_FLOOR_PERMISSIONS, ADMIN_ONLY_PERMISSIONS, OWNER_ONLY_PERMISSIONS, type RoleAccess } from "@/lib/schemas/security";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

type Editable = Exclude<Role, "owner">;

// Every permission, grouped the way the sidebar is, and worded as the thing
// a person does rather than as the permission name.
const GROUPS: { label: string; items: { permission: Permission; label: string }[] }[] = [
  {
    label: "Content",
    items: [
      { permission: "content:read", label: "View posts, jobs, site content and translations" },
      { permission: "content:write", label: "Create, edit and publish them" },
      { permission: "media:read", label: "View the media library" },
      { permission: "media:write", label: "Upload, rename and delete media" },
    ],
  },
  {
    label: "Inbox",
    items: [
      { permission: "submissions:read", label: "View enquiries and job applications" },
      { permission: "submissions:write", label: "Reply, triage, restore and delete them" },
    ],
  },
  {
    label: "Site",
    items: [
      { permission: "seo:read", label: "View SEO settings and audits" },
      { permission: "seo:write", label: "Edit metadata, redirects, robots and schema" },
      { permission: "performance:read", label: "View performance and web vitals" },
      { permission: "performance:write", label: "Run checks and clear caches" },
      { permission: "security:read", label: "View security events, rules and headers" },
      { permission: "security:write", label: "Change access rules, limits and sessions" },
    ],
  },
  {
    label: "Administration",
    items: [
      { permission: "users:read", label: "View staff accounts" },
      { permission: "users:manage", label: "Invite, change roles and remove accounts" },
      { permission: "settings:read", label: "View settings" },
      { permission: "settings:write", label: "Change settings" },
      { permission: "audit:read", label: "Read the audit log" },
      { permission: "settings:owner", label: "Owner only settings" },
      { permission: "owner:manage", label: "Transfer ownership" },
    ],
  },
];

const ROLE_LABEL: Record<Editable, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };
const COLUMNS: Editable[] = ["admin", "editor", "viewer"];

const LOCK_NOTE = {
  "owner-only": "Owner only, so this cannot be handed to another role.",
  "admin-only": "Admin and Owner only. Handing this to an Editor or a Viewer would make them an administrator without saying so; change their role instead.",
  required: "Held by Admin whatever this grid says, so nobody can untick their own way out of the console.",
} as const;

// Exactly the permissions this grid puts a box against. It travels with the
// save so that a permission added to the console later keeps its shipped
// answer rather than counting as unticked.
const COVERED = GROUPS.flatMap((g) => g.items.map((i) => i.permission));

// The grid an Owner or Admin uses to decide which console features each role
// may reach. Owner has no column: it always holds everything, which is what
// makes a mistake here undoable.
export function RoleAccessForm({ initial, csrf, canChange, shipped }: { initial: RoleAccess; csrf: string; canChange: boolean; shipped: RoleAccess }) {
  const router = useRouter();
  const toast = useToast();
  const [grid, setGrid] = useState<Record<Editable, Set<Permission>>>(() => ({
    admin: new Set(initial.roles.admin),
    editor: new Set(initial.roles.editor),
    viewer: new Set(initial.roles.viewer),
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => serialise(initial));

  function serialiseGrid(): RoleAccess {
    return { roles: { admin: [...grid.admin], editor: [...grid.editor], viewer: [...grid.viewer] }, known: COVERED };
  }
  const dirty = serialise(serialiseGrid()) !== saved;

  function toggle(role: Editable, permission: Permission, on: boolean) {
    setGrid((g) => {
      const next = new Set(g[role]);
      if (on) next.add(permission);
      else next.delete(permission);
      return { ...g, [role]: next };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body = serialiseGrid();
    const res = await apiPost("/api/admin/security/roles", body, csrf);
    setPending(false);
    if (res.data.ok) {
      setSaved(serialise(body));
      toast({ kind: "success", title: "Role access saved", body: "Everyone sees the change on their next page load." });
      router.refresh();
      return;
    }
    setError(describeError(res.status, res.data.error));
    toast({ kind: "error", title: "Not saved" });
  }

  function reset() {
    setGrid({ admin: new Set(shipped.roles.admin), editor: new Set(shipped.roles.editor), viewer: new Set(shipped.roles.viewer) });
  }

  return (
    <Card
      title="Roles and access"
      description="Which console features each role may use. Tick to allow, untick to take away. Owner is not listed because it always holds everything, which is what lets a mistake here be undone."
    >
      <form onSubmit={save} noValidate>
        <TableFrame>
          <div className="adm-table-wrap" tabIndex={0}>
            <table className="adm-table adm-perm-table">
              <caption className="adm-sr">Console features by role</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Owner</th>
                  {COLUMNS.map((r) => (
                    <th scope="col" key={r}>{ROLE_LABEL[r]}</th>
                  ))}
                </tr>
              </thead>
              {GROUPS.map((g) => (
                <tbody key={g.label}>
                  <tr className="adm-perm-group">
                    <th scope="colgroup" colSpan={5}>{g.label}</th>
                  </tr>
                  {g.items.map((item) => (
                    <tr key={item.permission}>
                      <th scope="row">
                        {item.label}
                        <span className="adm-perm-key">{item.permission}</span>
                      </th>
                      <td data-label="Owner">
                        <span className="adm-perm-always" title="The Owner always holds every permission">Always</span>
                      </td>
                      {COLUMNS.map((role) => {
                        const lock = OWNER_ONLY_PERMISSIONS.includes(item.permission)
                          ? "owner-only"
                          : role === "admin" && ADMIN_FLOOR_PERMISSIONS.includes(item.permission)
                            ? "required"
                            : role !== "admin" && ADMIN_ONLY_PERMISSIONS.includes(item.permission)
                              ? "admin-only"
                              : null;
                        const checked = lock === "required" ? true : lock !== null ? false : grid[role].has(item.permission);
                        return (
                          <td key={role} data-label={ROLE_LABEL[role]}>
                            <label className="adm-perm-box" title={lock ? LOCK_NOTE[lock] : undefined}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canChange || pending || lock !== null}
                                onChange={(e) => toggle(role, item.permission, e.target.checked)}
                                aria-label={`${ROLE_LABEL[role]}: ${item.label}${lock ? `. ${LOCK_NOTE[lock]}` : ""}`}
                              />
                              <span className="adm-sr">{ROLE_LABEL[role]}</span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </TableFrame>

        <Alert kind="info" live={false}>
          Some boxes are fixed. The owner only settings and transferring ownership belong to the Owner alone. Inviting people, changing security and changing settings stay with Admin, because handing them to an Editor would make that person an administrator without saying so. Six rows are held for Admin whatever the grid says, so an Admin can never untick their own way out of Users and Security. Ticking a write also grants the matching view, since the page that offers the change sits behind it.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        {!canChange && <Alert kind="info" live={false}>You can see this grid but not change it. Changing it needs the settings permission.</Alert>}
        <div className="adm-actions">
          <Button type="submit" size="sm" disabled={!canChange || pending || !dirty}>{pending ? "Saving" : "Save role access"}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!canChange || pending} onClick={reset}>Back to the shipped defaults</Button>
        </div>
      </form>
    </Card>
  );
}

// A stable string for "has anything changed", order independent.
function serialise(a: RoleAccess): string {
  return COLUMNS.map((r) => `${r}:${[...(a.roles[r] ?? [])].sort().join(",")}`).join("|");
}
