"use client";

import { useCallback, useState } from "react";

// Client helper for /api/admin route handlers: JSON body, CSRF header from the
// token the page embedded, credentials included. Every handler answers with
// { ok, error?, ... } and a meaningful HTTP status.

export type ApiResponse<T = Record<string, unknown>> = { status: number; data: { ok: boolean; error?: string; retryAfter?: number } & T };

export async function apiPost<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  csrf: string,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({ ok: false, error: "bad_response" }))) as ApiResponse<T>["data"];
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { ok: false, error: "network" } as ApiResponse<T>["data"] };
  }
}

// Human messages for the generic error codes the API returns. Auth failures
// stay deliberately vague (no account enumeration).
export function describeError(status: number, code: string | undefined, retryAfter?: number): string {
  if (status === 0) return "Could not reach the server. Check your connection and try again.";
  if (status === 429 || code === "rate_limited") {
    const wait = retryAfter ? `about ${Math.ceil(retryAfter / 60)} minute${retryAfter > 90 ? "s" : ""}` : "a few minutes";
    return `Too many attempts. Please wait ${wait} and try again.`;
  }
  switch (code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "invalid_code":
      // The verify and enrol forms replace this with the reason the route
      // gives; see describeCodeRejection.
      return "That code was not accepted.";
    case "invalid_current":
      return "Your current password was not accepted.";
    case "csrf":
      return "This form has expired. Reload the page and try again.";
    case "unauthenticated":
    case "mfa_required":
      return "Your session has ended. Sign in again.";
    case "forbidden":
      return "You do not have permission to do that.";
    case "invalid":
      return "Please check the highlighted fields.";
    case "database_unavailable":
      return "The database is not reachable right now. Try again in a moment.";
    case "server_error":
    case "bad_response":
      return "Something went wrong on the server. Please try again, and tell an administrator if it keeps happening.";
    case "same":
      return "Choose a password you have not used here before.";
    case "confirm":
      return "The confirmation text did not match.";
    case "exists":
      return "That address already has an account.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Why a second-factor code was refused, from the detail the verify and enrol
// routes add to invalid_code. Specific on purpose: "not accepted" left people
// guessing between clocks, stale authenticator entries and old recovery
// codes, and the server knows which it was.
export type CodeRejection = { kind?: string; reason?: string; driftSeconds?: number };

export function describeCodeRejection(d: CodeRejection, context: "verify" | "enrol" = "verify"): string {
  const drift = d.driftSeconds ?? 0;
  const amount = Math.abs(drift) >= 120 ? `${Math.round(Math.abs(drift) / 60)} minutes` : `${Math.abs(drift)} seconds`;
  switch (d.reason) {
    case "clock":
      return drift > 0
        ? `That code belongs to a time about ${amount} ahead of this server, so the clock on your device is fast. Set its date and time to automatic, then enter the newest code.`
        : `That code is about ${amount} old, or the clock on your device is that far behind. Enter the code your app shows right now; if it keeps happening, set the date and time on your device to automatic.`;
    case "replay":
      return "That code has already been used. Wait for your app to show the next one, then enter that.";
    case "no_match":
      return "That recovery code was not accepted. Only the codes shown the last time two-factor authentication was set up work, and each works once. They never contain the letters I or O or the digits 0 or 1.";
    case "malformed":
      return context === "enrol" ? "Enter the 6 digit code the app shows." : "Enter the 6 digit code from your authenticator app, or a recovery code in the form ABCDE-FGHJK.";
    default:
      return context === "enrol"
        ? "That code was not accepted. Make sure you are reading the entry you have just added, not an older DevelMo Admin entry, and enter the code it shows right now."
        : "That code was not accepted. If your authenticator shows more than one DevelMo Admin entry, use the newest one; older entries stopped working when two-factor authentication was set up again. A recovery code works here too.";
  }
}

export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const run = useCallback(
    async <T = Record<string, unknown>>(
      url: string,
      body: Record<string, unknown>,
      csrf: string,
    ): Promise<ApiResponse<T> | null> => {
      setPending(true);
      setError(null);
      setIssues({});
      const res = await apiPost<T>(url, body, csrf);
      setPending(false);
      if (!res.data.ok) {
        const raw = res.data as { issues?: { path: string; message: string }[] };
        if (raw.issues?.length) {
          setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
        }
        setError(describeError(res.status, res.data.error, res.data.retryAfter));
        return res;
      }
      return res;
    },
    [],
  );

  return { run, pending, error, issues, setError };
}
