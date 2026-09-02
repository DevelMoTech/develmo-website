"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function MfaVerifyForm({ csrf, next }: { csrf: string; next: string }) {
  const { run, pending, error } = useSubmit();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ redirectTo: string }>("/api/admin/auth/mfa/verify", { code, next }, csrf);
    if (res?.data.ok) window.location.assign(res.data.redirectTo || next);
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
          pattern={useRecovery ? undefined : "[0-9]{6}"}
          maxLength={useRecovery ? 16 : 6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <p className="adm-help">
          {useRecovery
            ? "Each recovery code works once."
            : "Open your authenticator app and enter the code for DevelMo Admin."}
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
        }}
      >
        {useRecovery ? "Use my authenticator app instead" : "Use a recovery code instead"}
      </button>
    </form>
  );
}
