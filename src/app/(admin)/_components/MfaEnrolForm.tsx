"use client";

import { useState } from "react";
import { describeCodeRejection, useSubmit, type CodeRejection } from "./api-client";

export function MfaEnrolForm({ csrf, qr, secret, email }: { csrf: string; qr: string; secret: string; email: string }) {
  const { run, pending, error, setError } = useSubmit();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [redirectTo, setRedirectTo] = useState("/admin");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ recoveryCodes: string[]; redirectTo: string } & CodeRejection>("/api/admin/auth/mfa/enrol", { code: code.replace(/\s+/g, "") }, csrf);
    if (res?.data.ok) {
      setCodes(res.data.recoveryCodes);
      setRedirectTo(res.data.redirectTo || "/admin");
      return;
    }
    if (res?.data.error === "invalid_code") setError(describeCodeRejection(res.data, "enrol"));
    else if (res?.data.error === "invalid") setError(describeCodeRejection({ reason: "malformed" }, "enrol"));
  }

  if (codes) {
    return (
      <div>
        <div className="adm-alert adm-alert-success" role="status" aria-live="polite">
          <p>Two-factor authentication is on. Save these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator. Any recovery codes from an earlier set-up no longer work.</p>
        </div>
        <ul className="adm-codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <a className="adm-btn adm-btn-primary adm-btn-block" href={redirectTo}>
          I have saved my recovery codes
        </a>
      </div>
    );
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-alert adm-alert-info" role="note">
        <p>
          If your authenticator app already has a DevelMo Admin entry for {email}, delete it first. Only the entry you add now will work, and recovery codes you saved before stop working.
        </p>
      </div>
      <p className="adm-help">
        1. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
      </p>
      <img className="adm-qr" src={qr} alt="QR code for your authenticator app" width={200} height={200} />
      <details>
        <summary className="adm-help">Cannot scan? Enter the key manually</summary>
        <p className="adm-secret" aria-label="Manual setup key">{secret}</p>
        <p className="adm-help">Account: {email}. Type: time based, 6 digits, 30 seconds.</p>
      </details>
      <div className="adm-field">
        <label className="adm-label" htmlFor="enrol-code">2. Enter the 6 digit code the app shows</label>
        <input
          id="enrol-code"
          className="adm-input adm-input-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      {error && (
        <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}
      <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
        {pending ? "Checking" : "Turn on two-factor authentication"}
      </button>
    </form>
  );
}
