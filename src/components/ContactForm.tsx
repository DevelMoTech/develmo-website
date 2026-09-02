"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { contactSchema, RECAPTCHA_ACTION } from "@/lib/contact-schema";
import { t } from "@/lib/i18n";

const budgets = ["Under $5k", "$5k - $15k", "$15k - $50k", "$50k+", "Not sure yet"];
const serviceOpts = [
  "AI & Data Solutions",
  "Computer Vision & Automation",
  "Web & Mobile Development",
  "Cloud & DevOps Engineering",
  "Cybersecurity & Emerging Tech",
  "Staff Augmentation",
  "CrowdIQ",
  "Other",
];

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

// reCAPTCHA v3 is invisible: no widget, no user interaction. api.js is loaded
// only when a site key is configured, and the token is minted at submit time
// (tokens expire after ~2 minutes, so one taken on page load would go stale).
declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

export function executeRecaptcha(key: string, action: string = RECAPTCHA_ACTION): Promise<string> {
  const g = window.grecaptcha;
  // Undefined when api.js is still loading or was blocked (extension, CSP, offline).
  if (!g) return Promise.reject(new Error("recaptcha-unavailable"));
  return new Promise((resolve, reject) => {
    g.ready(() => {
      g.execute(key, { action }).then(resolve, reject);
    });
  });
}

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm({ locale = "en" }: { locale?: string }) {
  const tr = (s: string) => t(s, locale);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [ctx, setCtx] = useState<Record<string, string>>({});

  // Read qualification params (?service/?product/?industry/?intent/?source/?topic/?region)
  // so CTAs across the site pre-qualify the lead.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c: Record<string, string> = {};
    ["service", "product", "industry", "intent", "source", "topic", "region"].forEach((k) => {
      const val = q.get(k);
      if (val) c[k] = val;
    });
    setCtx(c);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const baseMsg = String(fd.get("message") || "");
    const ctxStr = Object.entries(ctx)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const payload = {
      firstName: String(fd.get("firstName") || ""),
      lastName: String(fd.get("lastName") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      company: String(fd.get("company") || ""),
      budget: String(fd.get("budget") || ""),
      service: String(fd.get("service") || ""),
      message: ctxStr ? `${baseMsg}\n\n[Context] ${ctxStr}` : baseMsg,
      consent: fd.get("consent") === "on",
      company_url: String(fd.get("company_url") || ""),
    };

    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || tr("Please check the form and try again."));
      return;
    }

    setStatus("submitting");

    let recaptchaToken = "";
    if (siteKey) {
      try {
        recaptchaToken = await executeRecaptcha(siteKey);
      } catch {
        setStatus("idle");
        setError(tr("The spam check is still loading. Please try again in a moment."));
        return;
      }
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, recaptchaToken }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          data.code === "captcha"
            ? tr("Could not verify that you are human. Please refresh the page and try again.")
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
    return (
      <div className="form-success">
        {tr("Thanks. Your message is on its way and our team will get back to you within one business day.")}
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {siteKey && (
        <Script src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`} />
      )}
      {error && <div className="form-error">{error}</div>}
      {(ctx.product || ctx.service || ctx.industry || ctx.topic) && (
        <div className="form-ctx">
          {tr("Enquiring about")}{" "}
          <strong>{ctx.product || ctx.service || ctx.industry || ctx.topic}</strong>
          {ctx.intent === "demo" ? ` · ${tr("demo request")}` : ""}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="firstName">{tr("First name")} *</label>
          <input id="firstName" name="firstName" required />
        </div>
        <div className="field">
          <label htmlFor="lastName">{tr("Last name")} *</label>
          <input id="lastName" name="lastName" required />
        </div>
        <div className="field">
          <label htmlFor="email">{tr("Email")} *</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">{tr("Phone")}</label>
          <input id="phone" name="phone" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="company">{tr("Company")}</label>
          <input id="company" name="company" />
        </div>
        <div className="field">
          <label htmlFor="budget">{tr("Budget")}</label>
          <select id="budget" name="budget" defaultValue="">
            <option value="">{tr("Select...")}</option>
            {budgets.map((b) => (
              <option key={b} value={b}>{tr(b)}</option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="service">{tr("Service interest")}</label>
          <select id="service" name="service" defaultValue="">
            <option value="">{tr("Select...")}</option>
            {serviceOpts.map((s) => (
              <option key={s} value={s}>{tr(s)}</option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="message">{tr("Project details")} *</label>
          <textarea id="message" name="message" required placeholder={tr("What are you trying to build or solve?")} />
        </div>
      </div>

      {/* honeypot: real users never see or fill this */}
      <input className="hp" type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <label className="consent">
        <input type="checkbox" name="consent" required />{" "}
        {tr(
          "I agree to DevelMo storing and using my details to respond to this enquiry, in line with the Privacy Policy.",
        )}
      </label>

      <button className="btn btn-teal btn-lg" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? tr("Sending...") : tr("Book My Consultation")}
      </button>
      <p className="form-note">{tr("We reply within one business day. No obligation.")}</p>
      {siteKey && <RecaptchaNotice tr={tr} />}
    </form>
  );
}

// Google's terms require either the floating badge or this attribution. The
// badge is hidden in globals.css because it lands on top of the StickyCta on
// mobile, so the line below is what keeps the integration compliant.
export function RecaptchaNotice({ tr }: { tr: (s: string) => string }) {
  const template = tr("This site is protected by reCAPTCHA and the Google {privacy} and {terms} apply.");
  const links: Record<string, { href: string; label: string }> = {
    "{privacy}": { href: "https://policies.google.com/privacy", label: tr("Privacy Policy") },
    "{terms}": { href: "https://policies.google.com/terms", label: tr("Terms of Service") },
  };
  return (
    <p className="form-note recaptcha-note">
      {template.split(/(\{privacy\}|\{terms\})/g).map((part, i) => {
        const link = links[part];
        return link ? (
          <a key={i} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </p>
  );
}
