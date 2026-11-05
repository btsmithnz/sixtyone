import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at Postgres.",
    );
  }
  return postgres(url, {
    // Keep each instance's pool small and rely on the provider's pooler
    // (e.g. Neon's pgbouncer endpoint) for the fan-in. A few connections, not
    // one, because Vercel's Fluid compute runs concurrent requests in the same
    // instance. Prepared statements don't survive transaction pooling.
    max: 5,
    prepare: false,
    idle_timeout: 20,
  });
}

// Reuse one client across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};
export const sql = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
