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
    // Serverless functions are short-lived and many run at once: keep each
    // instance's pool tiny and rely on the provider's pooler (e.g. Neon's
    // pgbouncer endpoint). Prepared statements don't survive transaction
    // pooling, so turn them off.
    max: process.env.VERCEL ? 1 : 5,
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
