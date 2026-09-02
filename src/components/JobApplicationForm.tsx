"use client";

import { useState } from "react";
import Script from "next/script";
import { executeRecaptcha, RecaptchaNotice } from "@/components/ContactForm";
import { MAX_CV_BYTES } from "@/lib/documents";
import { t } from "@/lib/i18n";
import { APPLY_RECAPTCHA_ACTION, applicationSchema } from "@/lib/schemas/job";

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

type Status = "idle" | "submitting" | "success" | "error";

// Public application form (brief §3.4): same protections as the contact
// form (honeypot, durable rate limit, optional reCAPTCHA), multipart so the
// CV travels with the fields and is sniffed server side.
export function JobApplicationForm({ jobSlug, locale = "en" }: { jobSlug: string; locale?: string }) {
  const tr = (s: string) => t(s, locale);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      location: String(fd.get("location") || ""),
      linkedinUrl: String(fd.get("linkedinUrl") || ""),
      portfolioUrl: String(fd.get("portfolioUrl") || ""),
      coverNote: String(fd.get("coverNote") || ""),
      consent: fd.get("consent") === "on",
      locale,
    };
    const parsed = applicationSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message;
      setError(message ? tr(message) : tr("Please check the form and try again."));
      return;
    }
    const cv = fd.get("cv");
    if (!(cv instanceof File) || cv.size === 0) {
      setError(tr("Please attach your CV as a PDF or DOCX file."));
      return;
    }
    if (cv.size > MAX_CV_BYTES) {
      setError(tr("Your CV must be under 10 MB."));
      return;
    }

    setStatus("submitting");
    let recaptchaToken = "";
    if (siteKey) {
      try {
        // api.js loads asynchronously; give it a moment before giving up.
        for (let i = 0; i < 40 && !window.grecaptcha; i++) await new Promise((r) => setTimeout(r, 200));
        recaptchaToken = await executeRecaptcha(siteKey, APPLY_RECAPTCHA_ACTION);
      } catch {
        setStatus("idle");
        setError(tr("The spam check is still loading. Please try again in a moment."));
        return;
      }
    }

    const body = new FormData();
    for (const [k, v] of Object.entries(parsed.data)) body.set(k, String(v));
    body.set("cv", cv);
    body.set("jobSlug", jobSlug);
    body.set("company_url", String(fd.get("company_url") || ""));
    body.set("recaptchaToken", recaptchaToken);

    try {
      const res = await fetch("/api/jobs/apply", { method: "POST", body });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; code?: string; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          data.code === "captcha"
            ? tr("Could not verify that you are human. Please refresh the page and try again.")
            : data.code === "cv_type"
              ? tr("That file could not be read as a PDF or DOCX. Please try another export.")
              : data.code === "cv_size" || res.status === 413
                ? tr("The file could not be uploaded. Please try a smaller CV or email it to info@develmo.com.")
                : data.error || tr("Something went wrong. Please email info@develmo.com."),
        );
        return;
      }
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setError(tr("Network error. Please email info@develmo.com."));
    }
  }

  if (status === "success") {
    return <div className="form-success">{tr("Thanks. Your application is in. We will review it and get back to you by email.")}</div>;
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate encType="multipart/form-data">
      {siteKey && <Script src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`} />}
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ja-name">{tr("Full name")} *</label>
          <input id="ja-name" name="name" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="ja-email">{tr("Email")} *</label>
          <input id="ja-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="ja-phone">{tr("Phone")}</label>
          <input id="ja-phone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="ja-location">{tr("Location")}</label>
          <input id="ja-location" name="location" autoComplete="address-level2" />
        </div>
        <div className="field">
          <label htmlFor="ja-linkedin">{tr("LinkedIn profile")}</label>
          <input id="ja-linkedin" name="linkedinUrl" type="url" placeholder="https://www.linkedin.com/in/" />
        </div>
        <div className="field">
          <label htmlFor="ja-portfolio">{tr("Portfolio or GitHub")}</label>
          <input id="ja-portfolio" name="portfolioUrl" type="url" placeholder="https://" />
        </div>
        <div className="field full">
          <label htmlFor="ja-cover">{tr("Cover note")}</label>
          <textarea id="ja-cover" name="coverNote" placeholder={tr("Tell us briefly why this role and what you have built.")} maxLength={4000} />
        </div>
        <div className="field full">
          <label htmlFor="ja-cv">{tr("CV (PDF or DOCX, up to 10 MB)")} *</label>
          <input id="ja-cv" name="cv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
        </div>
      </div>

      {/* honeypot: real users never see or fill this */}
      <input className="hp" type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <label className="consent">
        <input type="checkbox" name="consent" required />{" "}
        {tr("I agree to DevelMo storing my details and CV to assess this application, in line with the Privacy Policy.")}
      </label>

      <button className="btn btn-teal btn-lg" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? tr("Sending...") : tr("Send application")}
      </button>
      {siteKey && <RecaptchaNotice tr={tr} />}
    </form>
  );
}
