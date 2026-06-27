import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import pool from "./config/db";

dotenv.config();

async function migrate(): Promise<void> {
  const sql = readFileSync(
    join(__dirname, "migration", "001_tables.sql"),
    "utf-8"
  );

  try {
    await pool.query(sql);
    console.log("Migration completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
