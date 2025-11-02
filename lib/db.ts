import { Pool } from "pg";

// Help local/dev environments that see corporate/self-signed roots.
// In production, do NOT disable TLS verification unless you explicitly set DB_INSECURE=1.
if (
  (process.env.NODE_ENV !== "production" && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) ||
  process.env.DB_INSECURE === "1"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

let pool: Pool | null = null;

export function getDb() {
  if (!pool) {
    const connectionString =
      process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // NOTE: Using connectionString together with ssl options can result in
    // sslmode from the URL taking precedence and re-enabling verification
    // (causing SELF_SIGNED_CERT_IN_CHAIN on Vercel). To avoid that, we parse
    // the URL ourselves and pass discrete options to pg.Pool.
    const u = new URL(connectionString);

    const host = u.hostname;
    const port = Number(u.port || 5432);
    const user = decodeURIComponent(u.username || "");
    const password = decodeURIComponent(u.password || "");
    const database = u.pathname.replace(/^\//, "");

    pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 1000,
    });
  }

  return pool;
}

export async function query(text: string, params?: any[]) {
  const db = getDb();
  const start = Date.now();
  try {
    const res = await db.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

export async function getClient() {
  const db = getDb();
  return await db.connect();
}
