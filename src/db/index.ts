import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.ts";

// Server-only module: imported from repo functions, server actions and route
// handlers. Never import from a client component.

export type Db = NodePgDatabase<typeof schema>;

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Neon's serverless HTTP driver on Vercel; plain node-postgres elsewhere
  // (local dev, CI). Both run the same Drizzle schema and SQL.
  if (process.env.DATABASE_DRIVER === "neon" || /\bneon\.tech\b/.test(url)) {
    return drizzleNeonHttp(neon(url), { schema }) as unknown as Db;
  }
  const connectionUrl = new URL(url);
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  if (ca) {
    // pg gives URL SSL options precedence over ssl.ca; use the supplied CA
    // with certificate and hostname verification for hosted Postgres.
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
      connectionUrl.searchParams.delete(key);
    }
  }
  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    max: 5,
    // Fail fast: the public site falls back to the typed src/lib data on any
    // DB problem, so a hung connection must never hold a page render hostage.
    connectionTimeoutMillis: 2500,
    idleTimeoutMillis: 30_000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });
  return drizzle(pool, { schema });
}

// Lazy singleton, kept on globalThis so dev-server HMR reuses the pool.
const g = globalThis as typeof globalThis & { __develmoDb?: Db };

export function getDb(): Db {
  g.__develmoDb ??= createDb();
  return g.__develmoDb;
}
