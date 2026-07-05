import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../config/db";

interface SubscriberRow {
  id: number;
  plan_id: number;
  account_status: string;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  let subscriberId: number | undefined;

  try {
    const secret = process.env["JWT_SECRET"] ?? "";
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "object" && decoded !== null) {
      const id = Number((decoded as { id?: unknown })["id"]);
      if (Number.isFinite(id)) {
        subscriberId = id;
      }
    }
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (subscriberId === undefined) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    // Re-query account_status and plan_id from the DB rather than reading them
    // from the JWT payload. A token issued before a suspension or plan change
    // would otherwise keep granting stale permissions until it expires (up to 24h).
    const result = await pool.query<SubscriberRow>(
      "SELECT id, plan_id, account_status FROM subscribers WHERE id = $1",
      [subscriberId]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ error: "Subscriber not found" });
      return;
    }
    if (row.account_status !== "active") {
      res.status(403).json({ error: "Account is not active" });
      return;
    }
    req.subscriber = {
      id: subscriberId,
      planId: row.plan_id,
      accountStatus: row.account_status,
    };
    next();
  } catch (err) {
    console.error("[authenticate] Subscriber lookup failed:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
}
