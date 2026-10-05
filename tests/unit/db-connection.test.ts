import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pool: vi.fn(), drizzle: vi.fn(() => ({})), neon: vi.fn(), drizzleNeon: vi.fn(() => ({})) }));
vi.mock("pg", () => ({ Pool: class { constructor(config: unknown) { mocks.pool(config); } } }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: mocks.drizzleNeon }));

import { getDb } from "../../src/db/index";

afterEach(() => {
  delete (globalThis as typeof globalThis & { __develmoDb?: unknown }).__develmoDb;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("database connections", () => {
  it("keeps local Postgres working without a CA", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost:54329/develmo");
    vi.stubEnv("DATABASE_DRIVER", "");
    vi.stubEnv("DATABASE_SSL_CA", "");
    getDb();
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: "postgres://localhost:54329/develmo", max: 5 }));
    expect(mocks.pool.mock.calls[0][0]).not.toHaveProperty("ssl");
  });

  it.each(["trusted\ncertificate", "trusted\\ncertificate"])("verifies TLS with the supplied CA (%j)", (ca) => {
    vi.stubEnv("DATABASE_URL", "postgresql://app:secret@db.example:5432/postgres?sslmode=require&sslrootcert=old.pem&application_name=develmo");
    vi.stubEnv("DATABASE_DRIVER", "");
    vi.stubEnv("DATABASE_SSL_CA", ca);
    getDb();
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: "postgresql://app:secret@db.example:5432/postgres?application_name=develmo",
      ssl: { ca: "trusted\ncertificate", rejectUnauthorized: true },
    }));
  });

  it("preserves the Neon driver", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://app:secret@db.neon.tech/postgres");
    vi.stubEnv("DATABASE_DRIVER", "");
    vi.stubEnv("DATABASE_SSL_CA", "trusted certificate");
    getDb();
    expect(mocks.neon).toHaveBeenCalled();
    expect(mocks.pool).not.toHaveBeenCalled();
  });
});
