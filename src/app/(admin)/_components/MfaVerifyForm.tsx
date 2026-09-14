"use client";

import { useState } from "react";
import { describeCodeRejection, useSubmit, type CodeRejection } from "./api-client";

// One field takes both kinds of code. The toggle only changes the label and
// the keyboard: the server decides what it was given, and nothing typed or
// pasted is cut short (a recovery code pasted into "6 digit code" used to
// lose its tail to maxLength and fail for no visible reason).
export function MfaVerifyForm({ csrf, next }: { csrf: string; next: string }) {
  const { run, pending, error, setError } = useSubmit();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ redirectTo: string } & CodeRejection>("/api/admin/auth/mfa/verify", { code, next }, csrf);
    if (res?.data.ok) {
      window.location.assign(res.data.redirectTo || next);
      return;
    }
    // The route says why: a clock that is out, a code already used, a
    // recovery code from an earlier set-up. Say that instead of "not accepted".
    // A body the schema refused (too short, too long) is a malformed code too,
    // not "check the highlighted fields" with nothing highlighted.
    if (res?.data.error === "invalid_code") setError(describeCodeRejection(res.data));
    else if (res?.data.error === "invalid") setError(describeCodeRejection({ reason: "malformed" }));
  }

  function onChange(value: string) {
    setCode(value);
    // Letters can only be a recovery code; switch the label and keyboard.
    if (!useRecovery && /[^\d\s]/.test(value)) setUseRecovery(true);
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="mfa-code">
          {useRecovery ? "Recovery code" : "6 digit code"}
        </label>
        <input
          id="mfa-code"
          className={useRecovery ? "adm-input" : "adm-input adm-input-code"}
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={16}
          required
          autoFocus
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="adm-help">
          {useRecovery
            ? "One of the codes shown when two-factor authentication was set up. Each works once."
            : "From your authenticator app, the DevelMo Admin entry. A recovery code works here too."}
        </p>
      </div>
      {error && (
        <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}
      <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
        {pending ? "Checking" : "Verify"}
      </button>
      <button
        type="button"
        className="adm-btn adm-btn-ghost adm-btn-block"
        onClick={() => {
          setUseRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
      >
        {useRecovery ? "Use my authenticator app instead" : "Use a recovery code instead"}
      </button>
    </form>
  );
}
