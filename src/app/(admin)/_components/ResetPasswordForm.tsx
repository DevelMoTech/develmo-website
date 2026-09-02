"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function ResetPasswordForm({ csrf, token }: { csrf: string; token: string }) {
  const { run, pending, error, issues, setError } = useSubmit();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    const res = await run<{ redirectTo: string }>("/api/admin/auth/reset", { token, password }, csrf);
    if (res?.data.ok) window.location.assign(res.data.redirectTo || "/admin/login");
    else if (res && res.data.error?.startsWith("reset_")) window.location.reload();
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="rp-password">New password</label>
        <input
          id="rp-password"
          className="adm-input"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={issues.password ? "true" : undefined}
          aria-describedby="rp-password-help"
        />
        <p id="rp-password-help" className={issues.password ? "adm-error" : "adm-help"}>
          {issues.password ?? "At least 12 characters."}
        </p>
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="rp-confirm">Confirm new password</label>
        <input
          id="rp-confirm"
          className="adm-input"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}
      <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
        {pending ? "Saving" : "Set new password"}
      </button>
    </form>
  );
}
