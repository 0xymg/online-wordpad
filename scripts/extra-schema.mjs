import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "document" (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled',
  html text NOT NULL DEFAULT '<p></p>',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_user_idx ON "document"(user_id);
CREATE INDEX IF NOT EXISTS document_updated_idx ON "document"(user_id, updated_at DESC);
`;

try {
  await pool.query(sql);
  console.log("✅ extra schema applied (user.metadata jsonb + document table)");
} catch (e) {
  console.error("❌ schema error:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
