import type { Request, Response, NextFunction } from "express";
import pool from "../config/db";

interface SubscriberRow {
  id: number;
  plan_id: number;
  account_status: string;
}

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    res.status(401).json({ error: "API key required" });
    return;
  }

  try {
    const result = await pool.query<SubscriberRow>(
      "SELECT id, plan_id, account_status FROM subscribers WHERE api_key = $1",
      [apiKey]
    );

    const row = result.rows[0];

    if (!row) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    if (row.account_status !== "active") {
      res.status(403).json({ error: "Account is not active" });
      return;
    }

    req.subscriber = {
      id: row.id,
      planId: row.plan_id,
      accountStatus: row.account_status,
    };

    next();
  } catch (err) {
    console.error("[requireApiKey] Auth check failed:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
}
