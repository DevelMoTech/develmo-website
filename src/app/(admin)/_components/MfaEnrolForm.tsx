"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

export function MfaEnrolForm({ csrf, qr, secret, email }: { csrf: string; qr: string; secret: string; email: string }) {
  const { run, pending, error } = useSubmit();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [redirectTo, setRedirectTo] = useState("/admin");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ recoveryCodes: string[]; redirectTo: string }>("/api/admin/auth/mfa/enrol", { code }, csrf);
    if (res?.data.ok) {
      setCodes(res.data.recoveryCodes);
      setRedirectTo(res.data.redirectTo || "/admin");
    }
  }

  if (codes) {
    return (
      <div>
        <div className="adm-alert adm-alert-success" role="status" aria-live="polite">
          <p>Two-factor authentication is on. Save these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator.</p>
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
          pattern="[0-9]{6}"
          maxLength={6}
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
