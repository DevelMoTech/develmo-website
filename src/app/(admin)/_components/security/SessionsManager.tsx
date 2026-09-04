"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OversightUser, SessionRow } from "@/lib/admin/security";
import type { Role } from "@/lib/auth/rbac";
import type { UserActionInput } from "@/lib/schemas/security";
import { apiPost, describeError } from "../api-client";
import { Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Modal";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

// A readable client from the user agent, without pretending to be precise.
function client(ua: string | null): string {
  if (!ua) return "unknown client";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : /HeadlessChrome/.test(ua) ? "Headless Chrome" : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsPanel({ sessions, csrf }: { sessions: SessionRow[]; csrf: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SessionRow | null>(null);

  async function revoke() {
    if (!confirm) return;
    setBusy(confirm.id);
    const res = await apiPost("/api/admin/security/sessions/revoke", { sessionId: confirm.id }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: "Session revoked", body: `${confirm.email} is signed out of that browser on its next request.` });
      setConfirm(null);
      router.refresh();
    } else toast({ kind: "error", title: "Not revoked", body: describeError(res.status, res.data.error) });
  }

  return (
    <>
      <Card title={`Active sessions (${sessions.length})`} description="Every signed in browser, across every account." className="adm-card" />
      {sessions.length === 0 ? (
        <Card title="No active sessions" description="Nobody is signed in right now." />
      ) : (
        <div style={{ marginBlockEnd: 18 }}>
          <TableFrame>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="adm-sr">Active sessions</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Client</th>
                    <th scope="col">IP hash</th>
                    <th scope="col">Last seen</th>
                    <th scope="col">Expires</th>
                    <th scope="col"><span className="adm-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Account">
                        <strong>{s.email}</strong>
                        <div className="adm-muted" style={{ fontSize: 13 }}>{s.name}, {s.role}</div>
                        {s.current && <Badge tone="info">this browser</Badge>}
                        {s.mfaPending && <Badge tone="warn">two-factor pending</Badge>}
                      </td>
                      <td data-label="Client">{client(s.userAgent)}</td>
                      <td data-label="IP hash"><span className="adm-mono">{s.ipHash ? s.ipHash.slice(0, 12) : "none"}</span></td>
                      <td data-label="Last seen">{fmt(s.lastSeenAt)}</td>
                      <td data-label="Expires">{fmt(s.idleExpiresAt)}</td>
                      <td data-label="Actions" className="adm-td-actions">
                        <Button size="sm" variant="danger" disabled={busy === s.id} onClick={() => setConfirm(s)}>Revoke</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>
        </div>
      )}
      <ConfirmDialog
        id="sess-revoke"
        open={!!confirm}
        title="Revoke this session?"
        body={confirm ? `${confirm.email} on ${client(confirm.userAgent)} is signed out on its next request.${confirm.current ? " This is the browser you are using, so you will be signed out too." : ""}` : ""}
        confirmLabel="Revoke"
        pending={busy === confirm?.id}
        onConfirm={revoke}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

type Action = UserActionInput["action"];

const ACTION_LABEL: Record<Action, string> = {
  logout_all: "Sign out everywhere",
  force_password_reset: "Force password reset",
  force_mfa_reenrol: "Force two-factor re-enrolment",
  lock: "Lock account",
  unlock: "Unlock account",
};

const ACTION_BODY: Record<Action, (email: string) => string> = {
  logout_all: (e) => `Every session belonging to ${e} is revoked. They can sign in again straight away.`,
  force_password_reset: (e) => `${e} is signed out everywhere and must set a new password at the next sign in.`,
  force_mfa_reenrol: (e) => `${e} loses their authenticator enrolment, is signed out everywhere, and must scan a new code at the next sign in.`,
  lock: (e) => `${e} is signed out everywhere and cannot sign in until an Owner or Admin unlocks the account.`,
  unlock: (e) => `${e} can sign in again.`,
};

export function UsersPanel({ users, csrf, actorId, actorRole }: { users: OversightUser[]; csrf: string; actorId: string; actorRole: Role }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [ask, setAsk] = useState<{ user: OversightUser; action: Action } | null>(null);

  async function run() {
    if (!ask) return;
    setPending(true);
    const res = await apiPost<{ message: string; detail?: string }>("/api/admin/security/users/action", { userId: ask.user.id, action: ask.action }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: ACTION_LABEL[ask.action], body: res.data.message });
      setAsk(null);
      router.refresh();
    } else {
      const raw = res.data as { detail?: string };
      toast({ kind: "error", title: "Refused", body: raw.detail ?? describeError(res.status, res.data.error) });
    }
  }

  // Admins cannot act on Owners, and nobody locks themselves out. The server
  // enforces both; the buttons match so the refusal is never a surprise.
  function allowed(u: OversightUser, action: Action): boolean {
    if (u.role === "owner" && actorRole !== "owner") return false;
    if (u.id === actorId && (action === "lock" || action === "force_mfa_reenrol")) return false;
    return action === "unlock" ? u.status === "locked" : u.status !== "locked" || action !== "lock";
  }

  return (
    <>
      <Card title="Accounts" description="Force a sign out, a password change or a two-factor re-enrolment, and lock an account outright." className="adm-card" />
      <TableFrame>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="adm-sr">Accounts and their controls</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">State</th>
                <th scope="col">Sessions</th>
                <th scope="col">Last sign in</th>
                <th scope="col"><span className="adm-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Account">
                    <strong>{u.email}</strong>
                    <div className="adm-muted" style={{ fontSize: 13 }}>{u.name}, {u.role}</div>
                  </td>
                  <td data-label="State">
                    <div className="adm-seo-flags">
                      <Badge tone={u.status === "active" ? "ok" : u.status === "locked" ? "danger" : "muted"}>{u.status}</Badge>
                      {u.totpEnabled ? <Badge tone="ok">two-factor</Badge> : <Badge tone="warn">no two-factor</Badge>}
                      {u.mustChangePassword && <Badge tone="warn">password change due</Badge>}
                    </div>
                  </td>
                  <td data-label="Sessions">{u.activeSessions}</td>
                  <td data-label="Last sign in">{fmt(u.lastLoginAt)}</td>
                  <td data-label="Actions" className="adm-td-actions">
                    <div className="adm-actions">
                      {(["logout_all", "force_password_reset", "force_mfa_reenrol", u.status === "locked" ? "unlock" : "lock"] as Action[])
                        .filter((a) => allowed(u, a))
                        .map((a) => (
                          <Button key={a} size="sm" variant={a === "lock" ? "danger" : "ghost"} disabled={pending} onClick={() => setAsk({ user: u, action: a })}>
                            {ACTION_LABEL[a]}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableFrame>
      <ConfirmDialog
        id="user-action"
        open={!!ask}
        title={ask ? ACTION_LABEL[ask.action] : ""}
        body={ask ? ACTION_BODY[ask.action](ask.user.email) : ""}
        confirmLabel={ask ? ACTION_LABEL[ask.action] : "Confirm"}
        tone={ask?.action === "unlock" ? "primary" : "danger"}
        pending={pending}
        onConfirm={run}
        onCancel={() => setAsk(null)}
      />
    </>
  );
}
