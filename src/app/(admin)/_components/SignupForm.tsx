"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function SignupForm({ csrf, token, email }: { csrf: string; token: string; email: string }) {
  const { run, pending, error, issues, setError } = useSubmit();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    const res = await run<{ redirectTo: string }>("/api/admin/auth/signup", { token, name, password }, csrf);
    if (res?.data.ok) window.location.assign(res.data.redirectTo || "/admin");
    else if (res && res.data.error?.startsWith("invite_")) window.location.reload();
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="su-email">Email</label>
        <input id="su-email" className="adm-input" type="email" value={email} readOnly autoComplete="username" />
        <p className="adm-help">Set by your invitation.</p>
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="su-name">Your name</label>
        <input
          id="su-name"
          className="adm-input"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={issues.name ? "true" : undefined}
          aria-describedby={issues.name ? "su-name-err" : undefined}
        />
        {issues.name && <p id="su-name-err" className="adm-error">{issues.name}</p>}
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="su-password">Password</label>
        <input
          id="su-password"
          className="adm-input"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={issues.password ? "true" : undefined}
          aria-describedby="su-password-help"
        />
        <p id="su-password-help" className={issues.password ? "adm-error" : "adm-help"}>
          {issues.password ?? "At least 12 characters. A passphrase of several words works well."}
        </p>
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="su-confirm">Confirm password</label>
        <input
          id="su-confirm"
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
        {pending ? "Creating your account" : "Create account"}
      </button>
    </form>
  );
}
