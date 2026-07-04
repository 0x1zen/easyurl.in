import { Pool, types } from "pg";
import dotenv from "dotenv";

dotenv.config();

// BIGINT (OID 20) defaults to a string in node-postgres to avoid precision loss above
// Number.MAX_SAFE_INTEGER (~9 quadrillion). This app's id columns will never realistically
// approach that range, so parsing BIGINT as a JS number is a deliberate, scale-aware
// tradeoff applied once here rather than scattering Number() coercions across every file
// that reads a BIGINT-derived value (id, plan_id, subscriber_id, etc.).
types.setTypeParser(20, (val) => parseInt(val, 10));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password:process.env.DB_PASSWORD,
});

export default pool;