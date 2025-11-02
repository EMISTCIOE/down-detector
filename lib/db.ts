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

    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
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
