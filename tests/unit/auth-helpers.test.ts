import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "otplib";

beforeAll(() => {
  process.env.AUTH_SECRET = "unit-test-secret-that-is-long-enough-0123456789";
});

describe("session helpers", () => {
  it("idle expiry slides by 8 hours but never past the absolute expiry", async () => {
    const { computeIdleExpiry, IDLE_MS } = await import("@/lib/auth/session");
    const now = new Date("2026-09-01T10:00:00Z");
    const absolute = new Date("2026-09-30T10:00:00Z");
    expect(computeIdleExpiry(now, absolute).getTime()).toBe(now.getTime() + IDLE_MS);
    const nearEnd = new Date(absolute.getTime() - 60_000);
    expect(computeIdleExpiry(nearEnd, absolute).getTime()).toBe(absolute.getTime());
  });

  it("a session is live only when unrevoked and inside both windows", async () => {
    const { isSessionLive } = await import("@/lib/auth/session");
    const now = new Date("2026-09-01T10:00:00Z");
    const later = new Date(now.getTime() + 1000);
    const earlier = new Date(now.getTime() - 1000);
    expect(isSessionLive({ revokedAt: null, idleExpiresAt: later, absoluteExpiresAt: later }, now)).toBe(true);
    expect(isSessionLive({ revokedAt: now, idleExpiresAt: later, absoluteExpiresAt: later }, now)).toBe(false);
    expect(isSessionLive({ revokedAt: null, idleExpiresAt: earlier, absoluteExpiresAt: later }, now)).toBe(false);
    expect(isSessionLive({ revokedAt: null, idleExpiresAt: later, absoluteExpiresAt: earlier }, now)).toBe(false);
  });

  it("cookie options are httpOnly, Secure, SameSite=Lax on the root path", async () => {
    const { sessionCookieOptions, SESSION_COOKIE, CSRF_COOKIE } = await import("@/lib/auth/session");
    const o = sessionCookieOptions(new Date());
    expect(o).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true);
    expect(CSRF_COOKIE.startsWith("__Host-")).toBe(true);
  });
});

describe("token helpers", () => {
  it("random tokens are unique and url safe", async () => {
    const { randomToken } = await import("@/lib/auth/tokens");
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("safeEqual compares constant time and tolerates different lengths", async () => {
    const { safeEqual } = await import("@/lib/auth/tokens");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("signed tokens round trip and bind purpose, jti and subject", async () => {
    const { signToken, verifySignedToken } = await import("@/lib/auth/tokens");
    const token = await signToken({ purpose: "invite", jti: "row-1", subject: "a@b.co", expiresAt: new Date(Date.now() + 60_000) });
    expect(await verifySignedToken(token, "invite")).toEqual({ status: "ok", jti: "row-1", subject: "a@b.co" });
    expect(await verifySignedToken(token, "reset")).toEqual({ status: "invalid" });
  });

  it("expired tokens are reported as expired; tampered and foreign tokens as invalid", async () => {
    const { signToken, verifySignedToken } = await import("@/lib/auth/tokens");
    const expired = await signToken({ purpose: "reset", jti: "x", subject: "u", expiresAt: new Date(Date.now() - 1000) });
    expect(await verifySignedToken(expired, "reset")).toEqual({ status: "expired", jti: "x", subject: "u" });
    // An expired token for another purpose is still just invalid.
    expect(await verifySignedToken(expired, "invite")).toEqual({ status: "invalid" });
    const good = await signToken({ purpose: "reset", jti: "x", subject: "u", expiresAt: new Date(Date.now() + 60_000) });
    const tampered = good.slice(0, -2) + (good.endsWith("aa") ? "bb" : "aa");
    expect(await verifySignedToken(tampered, "reset")).toEqual({ status: "invalid" });
    expect(await verifySignedToken("not-a-token", "reset")).toEqual({ status: "invalid" });
  });
});

describe("password hashing", () => {
  it("uses argon2id and verifies only the right password", async () => {
    const { hashPassword, verifyPassword, dummyPasswordHash } = await import("@/lib/auth/password");
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "wrong")).toBe(false);
    expect((await dummyPasswordHash()).startsWith("$argon2id$")).toBe(true);
  }, 20_000);
});

describe("CSRF", () => {
  it("origin must match host, with Referer as fallback, and nothing else passes", async () => {
    const { originMatches } = await import("@/lib/auth/csrf");
    expect(originMatches(new Headers({ host: "develmo.com", origin: "https://develmo.com" }))).toBe(true);
    expect(originMatches(new Headers({ host: "develmo.com", origin: "https://evil.com" }))).toBe(false);
    expect(originMatches(new Headers({ host: "develmo.com", referer: "https://develmo.com/admin/login" }))).toBe(true);
    expect(originMatches(new Headers({ host: "develmo.com" }))).toBe(false);
    expect(originMatches(new Headers({ host: "localhost:3010", origin: "http://localhost:3010" }))).toBe(true);
    expect(originMatches(new Headers({ "x-forwarded-host": "develmo.com", host: "internal", origin: "https://develmo.com" }))).toBe(true);
  });

  it("double submit token must be present, long and identical", async () => {
    const { csrfTokenMatches } = await import("@/lib/auth/csrf");
    const t = "a".repeat(64);
    expect(csrfTokenMatches(t, t)).toBe(true);
    expect(csrfTokenMatches(t, "b".repeat(64))).toBe(false);
    expect(csrfTokenMatches(undefined, t)).toBe(false);
    expect(csrfTokenMatches(t, null)).toBe(false);
    expect(csrfTokenMatches("short", "short")).toBe(false);
  });
});

describe("TOTP", () => {
  it("encrypts secrets at rest and decrypts them back", async () => {
    const { encryptSecret, decryptSecret, newTotpSecret } = await import("@/lib/auth/totp");
    const secret = newTotpSecret();
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
    expect(() => decryptSecret(stored.slice(0, -4) + "AAAA")).toThrow();
  });

  it("verifies a current code, rejects garbage, and refuses replay of the same step", async () => {
    const { newTotpSecret, verifyTotp } = await import("@/lib/auth/totp");
    const secret = newTotpSecret();
    const code = await generate({ secret });
    const first = await verifyTotp(secret, code, null);
    expect(first.valid).toBe(true);
    expect(typeof first.step).toBe("number");
    expect((await verifyTotp(secret, code, first.step)).valid).toBe(false);
    expect((await verifyTotp(secret, "000000", null)).valid).toBe(false);
    expect((await verifyTotp(secret, "12345", null)).valid).toBe(false);
  });

  it("recovery codes are unique, normalised and hashed", async () => {
    const { generateRecoveryCodes, hashRecoveryCode } = await import("@/lib/auth/totp");
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase().replace("-", " ")));
    expect(hashRecoveryCode(codes[0])).not.toBe(hashRecoveryCode(codes[1]));
  });
});

describe("IP hashing", () => {
  it("hashes with the server salt and never stores the raw address", async () => {
    const { hashIp, getClientIp } = await import("@/lib/auth/ip");
    const h = hashIp("203.0.113.9");
    expect(h).toMatch(/^[a-f0-9]{40}$/);
    expect(h).not.toContain("203");
    expect(hashIp("203.0.113.9")).toBe(h);
    expect(getClientIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.7");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("auth zod schemas", () => {
  it("next paths must stay under /admin", async () => {
    const { nextPathSchema } = await import("@/lib/schemas/auth");
    expect(nextPathSchema.parse("/admin/account")).toBe("/admin/account");
    expect(nextPathSchema.parse("//evil.com")).toBe("/admin");
    expect(nextPathSchema.parse("https://evil.com/admin")).toBe("/admin");
    expect(nextPathSchema.parse("/contact-develmo")).toBe("/admin");
  });

  it("login lowercases email and requires a password; signup enforces 12 characters", async () => {
    const { loginSchema, signupSchema } = await import("@/lib/schemas/auth");
    expect(loginSchema.parse({ email: "  Owner@Develmo.com ", password: "x" }).email).toBe("owner@develmo.com");
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(signupSchema.safeParse({ token: "t".repeat(30), name: "A", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ token: "t".repeat(30), name: "A", password: "long enough password" }).success).toBe(true);
  });
});
