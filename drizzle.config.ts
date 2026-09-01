import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local on its own; Node 20.12+ can.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI, fresh clone): DATABASE_URL must come from the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
