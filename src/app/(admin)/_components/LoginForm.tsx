"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function LoginForm({ csrf, next }: { csrf: string; next: string }) {
  const { run, pending, error, issues } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ redirectTo: string }>("/api/admin/auth/login", { email, password, next }, csrf);
    if (res?.data.ok) window.location.assign(res.data.redirectTo || "/admin");
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="login-email">Email</label>
        <input
          id="login-email"
          className="adm-input"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={issues.email ? "true" : undefined}
          aria-describedby={issues.email ? "login-email-err" : undefined}
        />
        {issues.email && <p id="login-email-err" className="adm-error">{issues.email}</p>}
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="login-password">Password</label>
        <input
          id="login-password"
          className="adm-input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}
      <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
