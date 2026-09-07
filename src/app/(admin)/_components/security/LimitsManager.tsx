"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RateLimitRow } from "@/lib/admin/security";
import type { TurnstileInput } from "@/lib/schemas/security";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { TableFrame } from "../ui/TableFrame";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

function window(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} seconds`;
}

export function RateLimits({ rows, csrf }: { rows: RateLimitRow[]; csrf: string }) {
  return (
    <TableFrame>
      <div className="adm-table-wrap" tabIndex={0}>
        <table className="adm-table">
          <caption className="adm-sr">Per endpoint rate limits</caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th>
              <th scope="col">Limit</th>
              <th scope="col">In flight</th>
              <th scope="col"><span className="adm-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <LimitRow key={r.key} row={r} csrf={csrf} />
            ))}
          </tbody>
        </table>
      </div>
    </TableFrame>
  );
}

function LimitRow({ row, csrf }: { row: RateLimitRow; csrf: string }) {
  const router = useRouter();
  const toast = useToast();
  const [max, setMax] = useState(String(row.maxRequests));
  const [seconds, setSeconds] = useState(String(row.windowSeconds));
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = max !== String(row.maxRequests) || seconds !== String(row.windowSeconds);

  async function save() {
    const next: Record<string, string> = {};
    if (!/^\d+$/.test(max.trim()) || Number(max) < 1) next.max = "At least one request";
    if (!/^\d+$/.test(seconds.trim()) || Number(seconds) < 10) next.seconds = "At least ten seconds";
    if (Object.keys(next).length) {
      setIssues(next);
      return;
    }
    setPending(true);
    setIssues({});
    const res = await apiPost("/api/admin/security/rate-limits/save", { key: row.key, maxRequests: Number(max), windowSeconds: Number(seconds) }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: `${row.label} limit saved`, body: `${max} per ${window(Number(seconds))}, in force within 30 seconds.` });
      router.refresh();
    } else toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
  }

  async function reset() {
    setPending(true);
    const res = await apiPost("/api/admin/security/rate-limits/reset", { key: row.key }, csrf);
    setPending(false);
    if (res.data.ok) {
      setMax(String(row.defaults.maxRequests));
      setSeconds(String(row.defaults.windowSeconds));
      toast({ kind: "success", title: `${row.label} back to the default`, body: `${row.defaults.maxRequests} per ${window(row.defaults.windowSeconds)}.` });
      router.refresh();
    } else toast({ kind: "error", title: "Not reset", body: describeError(res.status, res.data.error) });
  }

  return (
    <tr>
      <td data-label="Endpoint">
        <strong>{row.label}</strong>
        <div className="adm-muted" style={{ fontSize: 13 }}>{row.description}</div>
        {row.isDefault ? <Badge tone="muted">code default</Badge> : <Badge tone="info">set here</Badge>}
      </td>
      <td data-label="Limit">
        <div className="adm-inline-form">
          <Input id={`rl-max-${row.key}`} label="Requests" type="number" min={1} max={10000} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} error={issues.max} disabled={pending} />
          <Input id={`rl-win-${row.key}`} label="Per (seconds)" type="number" min={10} max={86400} inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} error={issues.seconds} disabled={pending} />
        </div>
        <p className="adm-help">Default {row.defaults.maxRequests} per {window(row.defaults.windowSeconds)}.</p>
      </td>
      <td data-label="In flight">
        <span>{row.activeKeys} active window{row.activeKeys === 1 ? "" : "s"}</span>
        {row.atLimit > 0 && <div><Badge tone="warn">{row.atLimit} at the limit</Badge></div>}
      </td>
      <td data-label="Actions" className="adm-td-actions">
        <div className="adm-actions">
          {!row.isDefault && <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>Use default</Button>}
          <Button size="sm" onClick={save} disabled={pending || !dirty}>{pending ? "Saving" : "Save"}</Button>
        </div>
      </td>
    </tr>
  );
}

export function TurnstileForm({ initial, csrf }: { initial: TurnstileInput & { secretConfigured: boolean }; csrf: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [siteKey, setSiteKey] = useState(initial.siteKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = enabled !== initial.enabled || siteKey !== initial.siteKey;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiPost("/api/admin/security/turnstile", { enabled, siteKey: siteKey.trim() }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: enabled ? "Turnstile on" : "Turnstile off", body: enabled ? "The public forms will use Turnstile on the next request." : "The public forms keep using reCAPTCHA v3." });
      router.refresh();
      return;
    }
    const code = res.data.error;
    setError(code === "site_key_required" ? "A site key is required to switch Turnstile on." : code === "secret_missing" ? "TURNSTILE_SECRET_KEY is not set in the environment; add it before switching this on." : describeError(res.status, code));
    toast({ kind: "error", title: "Not saved" });
  }

  return (
    <Card title="Cloudflare Turnstile" description="An alternative to the reCAPTCHA v3 the public forms use today. The site key is public and is stored here; the secret stays in the environment.">
      <form className="adm-form" onSubmit={save} noValidate>
        <Toggle id="ts-enabled" checked={enabled} onChange={setEnabled} label={enabled ? "Turnstile is on" : "Turnstile is off, reCAPTCHA v3 is in use"} disabled={pending} />
        <Input id="ts-site-key" label="Site key" value={siteKey} onChange={(e) => setSiteKey(e.target.value)} maxLength={120} disabled={pending} help="From the Cloudflare dashboard. Public by design; it appears in the page source." />
        {!initial.secretConfigured && <Alert kind="warn" live={false}>TURNSTILE_SECRET_KEY is not set in the environment. Turnstile cannot be switched on until it is.</Alert>}
        <Alert kind="info" live={false}>
          Switching this on also needs https://challenges.cloudflare.com added to script-src and frame-src in the Content Security Policy, which ships with the code. This phase leaves the public policy byte identical, so ask for that one line change before you enable it.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-actions">
          <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save Turnstile settings"}</Button>
        </div>
      </form>
    </Card>
  );
}
