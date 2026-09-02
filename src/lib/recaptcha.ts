// Google reCAPTCHA v3 (invisible, score-based) verification.
//
// Stays inert unless RECAPTCHA_SECRET_KEY is set, so local dev and the e2e
// suite behave exactly as they did before the keys existed. The client asks
// grecaptcha for a fresh token at submit time; this verifies it server-side.

import { RECAPTCHA_ACTION } from "@/lib/contact-schema";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

const DEFAULT_MIN_SCORE = 0.5;

type SiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export type RecaptchaResult =
  | { ok: true; skipped: boolean; score: number | null }
  | { ok: false; reason: string };

export function recaptchaEnabled(): boolean {
  return !!process.env.RECAPTCHA_SECRET_KEY;
}

// 0.0 (almost certainly a bot) … 1.0 (almost certainly human). Google's own
// default cut-off is 0.5; override per environment with RECAPTCHA_MIN_SCORE.
function minScore(): number {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MIN_SCORE;
}

export async function verifyRecaptcha(token: string, ip?: string, action: string = RECAPTCHA_ACTION): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true, score: null };
  if (!token) return { ok: false, reason: "missing-token" };

  const params = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "local") params.set("remoteip", ip);

  let data: SiteVerifyResponse;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
      // Never let a slow Google call hold the submit open indefinitely.
      signal: AbortSignal.timeout(8_000),
    });
    data = (await res.json()) as SiteVerifyResponse;
  } catch {
    return { ok: false, reason: "verify-unreachable" };
  }

  if (!data.success) {
    return { ok: false, reason: data["error-codes"]?.join(",") || "rejected" };
  }
  if (data.action && data.action !== action) {
    return { ok: false, reason: `action:${data.action}` };
  }

  const score = typeof data.score === "number" ? data.score : 0;
  if (score < minScore()) return { ok: false, reason: `low-score:${score}` };

  return { ok: true, skipped: false, score };
}
