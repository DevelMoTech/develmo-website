// Fixtures for the admin e2e suite. Talks to the same database the server
// under test uses (DATABASE_URL from .env.local), through the same hashing and
// token helpers, so what the tests create is exactly what production creates.

import { Pool } from "pg";
import type { APIRequestContext, Page } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Environment already provides DATABASE_URL and AUTH_SECRET.
}

import { hashPassword } from "../../src/lib/auth/password";
import { sha256Hex, signToken } from "../../src/lib/auth/tokens";
import { encryptSecret } from "../../src/lib/auth/totp";

export const CSRF_COOKIE = "__Host-dm_csrf";
export const SESSION_COOKIE = "__Host-dm_session";

let pool: Pool | null = null;
export function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export function uniqueIp(): string {
  return `203.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
}

export async function createUser(opts: {
  email: string;
  password: string;
  role: "owner" | "admin" | "editor" | "viewer";
  name?: string;
  totpSecret?: string;
}): Promise<string> {
  const passwordHash = await hashPassword(opts.password);
  const res = await db().query<{ id: string }>(
    `insert into users (email, name, password_hash, role, totp_secret_enc, totp_enabled)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [opts.email, opts.name ?? "E2E User", passwordHash, opts.role, opts.totpSecret ? encryptSecret(opts.totpSecret) : null, !!opts.totpSecret],
  );
  return res.rows[0].id;
}

export async function createInvite(opts: {
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  expiresInMs?: number;
}): Promise<{ id: string; token: string }> {
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 72 * 3600 * 1000));
  const inserted = await db().query<{ id: string }>(
    `insert into invites (email, role, token_hash, expires_at) values ($1, $2, $3, $4) returning id`,
    [opts.email, opts.role, `pending-${Math.random()}`, expiresAt],
  );
  const id = inserted.rows[0].id;
  const token = await signToken({ purpose: "invite", jti: id, subject: opts.email, expiresAt });
  await db().query(`update invites set token_hash = $1 where id = $2`, [sha256Hex(token), id]);
  return { id, token };
}

export async function sessionIdsFor(email: string): Promise<string[]> {
  const res = await db().query<{ id: string }>(
    `select s.id from sessions s join users u on u.id = s.user_id where u.email = $1 and s.revoked_at is null order by s.created_at`,
    [email],
  );
  return res.rows.map((r) => r.id);
}

export async function securityEventCount(type: string, email: string): Promise<number> {
  const res = await db().query<{ n: string }>(`select count(*)::text as n from security_events where type = $1 and email = $2`, [type, email]);
  return Number(res.rows[0].n);
}

export async function cleanup(): Promise<void> {
  await db().query(`delete from users where email like 'e2e-%@example.com'`);
  await db().query(`delete from invites where email like 'e2e-%@example.com'`);
  await db().query(`delete from security_events where email like 'e2e-%@example.com'`);
  await pool?.end();
  pool = null;
}

// Reads the CSRF token the proxy set on this context by visiting an admin page.
export async function csrfFor(request: APIRequestContext, baseURL: string): Promise<string> {
  await request.get(`${baseURL}/admin/login`);
  const state = await request.storageState();
  const cookie = state.cookies.find((c) => c.name === CSRF_COOKIE);
  if (!cookie) throw new Error("csrf cookie not issued");
  return cookie.value;
}

export async function apiLogin(
  request: APIRequestContext,
  baseURL: string,
  creds: { email: string; password: string; next?: string },
) {
  const csrf = await csrfFor(request, baseURL);
  const res = await request.post(`${baseURL}/api/admin/auth/login`, {
    // Browsers send Origin on every POST; Playwright's request context does not.
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL },
    data: creds,
  });
  return { status: res.status(), body: (await res.json()) as { ok: boolean; error?: string; redirectTo?: string; retryAfter?: number }, csrf };
}

export async function uiLogin(page: Page, creds: { email: string; password: string }) {
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
