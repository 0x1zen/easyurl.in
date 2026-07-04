import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../config/db";

interface SubscriberRow {
  id: number;
  plan_id: number;
  account_status: string;
}

interface JwtTokenPayload {
  id: number;
  planId: number;
  accountStatus: string;
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

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];

  if (apiKey && typeof apiKey === "string") {
    // API key path — same checks as requireApiKey
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
      console.error("[authenticate] API key check failed:", err);
      res.status(500).json({ error: "Authentication failed" });
    }
    return;
  }

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    let subscriberId: number | undefined;
    try {
      const secret = process.env["JWT_SECRET"] ?? "";
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === "object" && decoded !== null) {
        // Defensive validation only — reject tokens where id is absent or not a number.
        // The global BIGINT parser in db.ts ensures id values arrive as JS numbers,
        // so no coercion is needed here; this check is purely about token integrity.
        const id = (decoded as { id?: unknown })["id"];
        if (typeof id === "number" && Number.isFinite(id)) {
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
      console.error("[authenticate] JWT subscriber lookup failed:", err);
      res.status(500).json({ error: "Authentication failed" });
    }
    return;
  }

  res.status(401).json({ error: "Authentication required" });
}
