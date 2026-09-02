"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function ForgotPasswordForm({ csrf }: { csrf: string }) {
  const { run, pending, error, issues } = useSubmit();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run("/api/admin/auth/forgot", { email }, csrf);
    if (res?.data.ok) setDone(true);
  }

  if (done) {
    return (
      <div className="adm-alert adm-alert-success" role="status" aria-live="polite">
        <p>If that address has an account, a reset link is on its way. It is valid for 60 minutes.</p>
      </div>
    );
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="fp-email">Email</label>
        <input
          id="fp-email"
          className="adm-input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={issues.email ? "true" : undefined}
          aria-describedby={issues.email ? "fp-email-err" : undefined}
        />
        {issues.email && <p id="fp-email-err" className="adm-error">{issues.email}</p>}
      </div>
      {error && (
        <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}
      <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
        {pending ? "Sending" : "Send reset link"}
      </button>
    </form>
  );
}
