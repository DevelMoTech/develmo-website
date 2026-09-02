import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, decodeJwt, errors, jwtVerify } from "jose";
import { deriveKey } from "./secret";

const ISSUER = "develmo-admin";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Constant-time string comparison. Both sides are hashed first so the compare
// never leaks length and never throws on mismatched sizes.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type TokenPurpose = "invite" | "reset" | "email_change";

// Signed, short-lived, single-use tokens. The signature (HS256, key derived
// from AUTH_SECRET) rejects forged or tampered tokens before any database
// lookup; the row referenced by `jti` is the single-use authority.
export async function signToken(opts: {
  purpose: TokenPurpose;
  jti: string;
  subject: string;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({ purpose: opts.purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setJti(opts.jti)
    .setSubject(opts.subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(opts.expiresAt.getTime() / 1000))
    .sign(deriveKey("token"));
}

export type SignedTokenResult =
  | { status: "ok"; jti: string; subject: string }
  | { status: "expired"; jti: string; subject: string }
  | { status: "invalid" };

export async function verifySignedToken(token: string, purpose: TokenPurpose): Promise<SignedTokenResult> {
  try {
    const { payload } = await jwtVerify(token, deriveKey("token"), { issuer: ISSUER });
    if (payload.purpose !== purpose || typeof payload.jti !== "string" || typeof payload.sub !== "string") {
      return { status: "invalid" };
    }
    return { status: "ok", jti: payload.jti, subject: payload.sub };
  } catch (err) {
    // jose checks the signature before the claims, so an expiry failure means
    // a genuine token that has simply run out: report it as such.
    if (err instanceof errors.JWTExpired) {
      const payload = decodeJwt(token);
      if (payload.purpose === purpose && typeof payload.jti === "string" && typeof payload.sub === "string") {
        return { status: "expired", jti: payload.jti, subject: payload.sub };
      }
    }
    return { status: "invalid" };
  }
}
