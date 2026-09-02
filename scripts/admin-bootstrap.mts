// One-time Owner bootstrap (brief §3.1).
//
//   ADMIN_BOOTSTRAP_EMAIL=owner@develmo.com ADMIN_BOOTSTRAP_TOKEN=<secret> \
//   npm run admin:bootstrap -- --token <secret>
//
// Creates the first Owner with a temporary password printed once. Refuses to
// run if any user already exists, or if ADMIN_BOOTSTRAP_TOKEN is unset or the
// --token argument does not match it. Unset both variables afterwards.

import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { count } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { auditLog, users } from "../src/db/schema/index.ts";
import { hashPassword } from "../src/lib/auth/password.ts";

function fail(msg: string): never {
  console.error(`admin:bootstrap: ${msg}`);
  process.exit(1);
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set.");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) fail("AUTH_SECRET must be set (32+ characters).");

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("ADMIN_BOOTSTRAP_EMAIL is missing or not an email address.");

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN ?? "";
  const argIndex = process.argv.indexOf("--token");
  const provided = argIndex >= 0 ? (process.argv[argIndex + 1] ?? "") : (process.argv.find((a) => a.startsWith("--token="))?.slice(8) ?? "");
  if (expected.length < 16) fail("ADMIN_BOOTSTRAP_TOKEN is unset or shorter than 16 characters.");
  if (!provided || !sameSecret(expected, provided)) fail("--token does not match ADMIN_BOOTSTRAP_TOKEN.");

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  try {
    const [{ n }] = await db.select({ n: count() }).from(users);
    if (n > 0) fail(`refusing to run: ${n} user account(s) already exist. Invite further staff from /admin/users.`);

    const tempPassword = randomBytes(18).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);
    const [owner] = await db
      .insert(users)
      .values({ email, name: "Owner", passwordHash, role: "owner", status: "active", mustChangePassword: true })
      .returning({ id: users.id });
    await db.insert(auditLog).values({
      actorId: null,
      actorEmail: "admin:bootstrap",
      action: "user.bootstrap",
      entityType: "user",
      entityId: owner.id,
      after: { email, role: "owner" },
    });

    console.log("");
    console.log("Owner account created.");
    console.log(`  Email:              ${email}`);
    console.log(`  Temporary password: ${tempPassword}`);
    console.log("");
    console.log("Sign in at /admin/login. You will be asked to set a new password and then");
    console.log("to enrol an authenticator app (required for the Owner role).");
    console.log("Now remove ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_TOKEN from the environment.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
