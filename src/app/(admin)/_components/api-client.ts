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
      return "That code was not accepted. Check the time on your device and try again.";
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
