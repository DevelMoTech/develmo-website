import {
  bigserial,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Raw sampled real-user metrics posted by /api/vitals. High volume, so a
// bigserial key and a covering index; p75 aggregation happens on read.
export const webVitals = pgTable(
  "web_vitals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    route: text("route").notNull(),
    // LCP | INP | CLS | FCP | TTFB
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    // mobile | desktop
    deviceClass: text("device_class").notNull().default("desktop"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_vitals_route_metric_created_idx").on(t.route, t.metric, t.createdAt)],
);

export const psiSnapshots = pgTable("psi_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  route: text("route").notNull(),
  // mobile | desktop
  strategy: text("strategy").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  // Category scores as returned by PSI, not reinterpreted.
  scores: jsonb("scores"),
  opportunities: jsonb("opportunities"),
});

export const buildStats = pgTable("build_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  buildId: text("build_id"),
  // Per-route first-load JS and chunk sizes parsed from the build output.
  routes: jsonb("routes"),
  chunks: jsonb("chunks"),
});
