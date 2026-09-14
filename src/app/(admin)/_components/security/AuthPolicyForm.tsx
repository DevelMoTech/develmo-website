"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MFA_POLICIES, type MfaPolicy } from "@/lib/schemas/security";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export type SecondFactorStats = {
  total: number;
  enrolled: number;
  // Owner and Admin accounts without an authenticator: the people "admins"
  // and "everyone" would send to enrol at their next sign in.
  adminsWithout: { name: string; email: string; role: string }[];
  // Editors and Viewers without one, counted only.
  othersWithout: number;
};

const OPTIONS: Record<MfaPolicy, { label: string; description: string }> = {
  off: {
    label: "Off",
    description: "Nobody is asked for a code, not even people who set an authenticator up. Their enrolment is kept for when this is turned back on.",
  },
  optional: {
    label: "Optional",
    description: "Each person decides. Anyone who sets up an authenticator under Account is asked for a code at every sign in. Nobody is made to.",
  },
  admins: {
    label: "Required for Owner and Admin",
    description: "Owner and Admin accounts must set up an authenticator before they can use the console. Editors and Viewers may.",
  },
  everyone: {
    label: "Required for everyone",
    description: "Every account must set up an authenticator before it can use the console.",
  },
};

// The second-factor policy (Security, Authentication). Only the Owner can
// change it, because it decides what a password alone is worth.
export function MfaPolicyForm({ initial, csrf, canChange, stats }: { initial: MfaPolicy; csrf: string; canChange: boolean; stats: SecondFactorStats }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<MfaPolicy>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== initial;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiPost("/api/admin/security/authentication", { mfa: value }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: `Second factor: ${OPTIONS[value].label}`, body: "Applies from the next sign in. Nobody who is signed in now is affected." });
      router.refresh();
      return;
    }
    setError(describeError(res.status, res.data.error));
    toast({ kind: "error", title: "Not saved" });
  }

  const forced = value === "everyone" ? stats.adminsWithout.length + stats.othersWithout : value === "admins" ? stats.adminsWithout.length : 0;

  return (
    <Card title="Second factor" description="Whether signing in needs a code from an authenticator app after the password, and for whom. A change applies to the next sign in at once; no restart, no deploy.">
      <form className="adm-form" onSubmit={save} noValidate>
        <fieldset className="adm-fieldset">
          <legend className="adm-label">Policy</legend>
          <div className="adm-choices">
            {MFA_POLICIES.map((p) => (
              <label key={p} className={`adm-choice${value === p ? " adm-choice-on" : ""}`} htmlFor={`mfa-${p}`}>
                <input id={`mfa-${p}`} type="radio" name="mfa" value={p} checked={value === p} onChange={() => setValue(p)} disabled={!canChange || pending} />
                <span>
                  <strong>{OPTIONS[p].label}</strong>
                  <span className="adm-help">{OPTIONS[p].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="adm-help">
          {stats.enrolled} of {stats.total} active account{stats.total === 1 ? "" : "s"} {stats.enrolled === 1 ? "has" : "have"} an authenticator set up.
        </p>
        {value === "off" && dirty && (
          <Alert kind="warn" live={false}>
            With this off, a stolen password is enough to sign in. Turn it back on as soon as the reason for turning it off has passed.
          </Alert>
        )}
        {forced > 0 && dirty && (
          <Alert kind="info" live={false}>
            {forced} account{forced === 1 ? "" : "s"} without an authenticator will be sent to set one up at the next sign in
            {stats.adminsWithout.length > 0 ? `: ${stats.adminsWithout.map((u) => u.email).join(", ")}${value === "everyone" && stats.othersWithout > 0 ? ` and ${stats.othersWithout} other${stats.othersWithout === 1 ? "" : "s"}` : ""}` : ""}.
          </Alert>
        )}
        {!canChange && <Alert kind="info" live={false}>Only the Owner can change this.</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-actions">
          <Button type="submit" size="sm" disabled={!canChange || pending || !dirty}>{pending ? "Saving" : "Save policy"}</Button>
        </div>
      </form>
    </Card>
  );
}
