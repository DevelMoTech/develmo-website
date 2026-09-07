"use client";

import { useState } from "react";
import Script from "next/script";
import { executeRecaptcha } from "@/components/ContactForm";
import { ACCESS_REQUEST_RECAPTCHA_ACTION, accessRequestSchema } from "@/lib/schemas/access";

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

// The public request form. It posts to /api/access-request, which creates a
// queue entry and nothing else: no account, no session, no invite. The same
// answer comes back whatever happens, so this page cannot be used to test
// whether an address already has an account.
export function RequestAccessForm() {
  const [values, setValues] = useState({ name: "", email: "", organisation: "", reason: "" });
  const [honeypot, setHoneypot] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validate with the same schema the API enforces, so the field level
    // messages match what the server would say.
    const parsed = accessRequestSchema.safeParse(values);
    if (!parsed.success) {
      setIssues(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? ""), i.message])));
      return;
    }
    setIssues({});
    setPending(true);

    let recaptchaToken = "";
    if (siteKey) {
      try {
        recaptchaToken = await executeRecaptcha(siteKey, ACCESS_REQUEST_RECAPTCHA_ACTION);
      } catch {
        setPending(false);
        setError("The spam check is still loading. Please try again in a moment.");
        return;
      }
    }

    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...parsed.data, company_url: honeypot, recaptchaToken }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setPending(false);
      if (data.ok) {
        setDone(true);
        return;
      }
      setError(data.error || "Could not submit the request. Please try again.");
    } catch {
      setPending(false);
      setError("Could not reach the server. Check your connection and try again.");
    }
  }

  if (done) {
    return (
      <div className="adm-alert adm-alert-success" role="status" aria-live="polite">
        <p>Thanks. If your request is approved you will get an email with a link to set up your account.</p>
      </div>
    );
  }

  return (
    <>
      {siteKey && <Script src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`} />}
      <form className="adm-form" onSubmit={onSubmit} noValidate>
        <div className="adm-field">
          <label className="adm-label" htmlFor="ra-name">Your name</label>
          <input id="ra-name" className="adm-input" type="text" autoComplete="name" required value={values.name} onChange={set("name")} aria-invalid={issues.name ? "true" : undefined} aria-describedby={issues.name ? "ra-name-err" : undefined} />
          {issues.name && <p id="ra-name-err" className="adm-error">{issues.name}</p>}
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="ra-email">Work email</label>
          <input id="ra-email" className="adm-input" type="email" autoComplete="email" required value={values.email} onChange={set("email")} aria-invalid={issues.email ? "true" : undefined} aria-describedby={issues.email ? "ra-email-err" : "ra-email-help"} />
          {issues.email ? <p id="ra-email-err" className="adm-error">{issues.email}</p> : <p id="ra-email-help" className="adm-help">The invitation goes to this address, so use one you can read.</p>}
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="ra-org">Company or team</label>
          <input id="ra-org" className="adm-input" type="text" autoComplete="organization" value={values.organisation} onChange={set("organisation")} />
          <p className="adm-help">Optional.</p>
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="ra-reason">What do you need access for?</label>
          <textarea id="ra-reason" className="adm-input" rows={4} required value={values.reason} onChange={set("reason")} aria-invalid={issues.reason ? "true" : undefined} aria-describedby={issues.reason ? "ra-reason-err" : undefined} />
          {issues.reason && <p id="ra-reason-err" className="adm-error">{issues.reason}</p>}
        </div>

        {/* Honeypot: hidden from people, filled in by bots. */}
        <div className="adm-sr" aria-hidden="true">
          <label htmlFor="ra-company-url">Company website</label>
          <input id="ra-company-url" name="company_url" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {error && (
          <div className="adm-alert adm-alert-error" role="alert" aria-live="assertive">
            <p>{error}</p>
          </div>
        )}

        <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={pending}>
          {pending ? "Sending" : "Request access"}
        </button>
      </form>
    </>
  );
}
