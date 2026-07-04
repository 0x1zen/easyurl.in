import type { Request, Response } from "express";
import pool from "../config/db";
import { invalidateCachedUrl } from "../services/urlService";

interface FlaggedDomainRow {
  id: number;
  domain: string;
  status: string;
  escalated_at: Date | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  admin_notes: string | null;
}

export async function handleListFlaggedDomains(
  req: Request,
  res: Response
): Promise<void> {
  const statusFilter = req.query["status"];

  try {
    let result;
    if (typeof statusFilter === "string") {
      result = await pool.query<FlaggedDomainRow>(
        "SELECT * FROM flagged_domains WHERE status = $1 ORDER BY escalated_at DESC",
        [statusFilter]
      );
    } else {
      result = await pool.query<FlaggedDomainRow>(
        "SELECT * FROM flagged_domains ORDER BY escalated_at DESC"
      );
    }
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("[handleListFlaggedDomains] Failed:", err);
    res.status(500).json({ error: "Failed to retrieve flagged domains" });
  }
}

export async function handleReviewDomain(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params["id"];
  const id = parseInt(typeof rawId === "string" ? rawId : "", 10);
  const { status, notes } = req.body as { status?: unknown; notes?: unknown };

  if (typeof status !== "string") {
    res.status(400).json({ error: "status must be 'approved' or 'blocked'" });
    return;
  }
  if (status !== "approved" && status !== "blocked") {
    res.status(400).json({ error: "status must be 'approved' or 'blocked'" });
    return;
  }

  const adminNotes = typeof notes === "string" ? notes : null;

  try {
    const updateResult = await pool.query<{ domain: string }>(
      `UPDATE flagged_domains
       SET status = $1, reviewed_by = 'admin', reviewed_at = NOW(), admin_notes = $2
       WHERE id = $3
       RETURNING domain`,
      [status, adminNotes, id]
    );

    const flaggedRow = updateResult.rows[0];
    if (!flaggedRow) {
      res.status(404).json({ error: "Flagged domain not found" });
      return;
    }

    const { domain } = flaggedRow;

    if (status === "blocked") {
      const urlResult = await pool.query<{ short_code: string }>(
        "UPDATE urls SET moderation_status = 'blocked' WHERE domain = $1 RETURNING short_code",
        [domain]
      );
      // Must actively invalidate — a stale cache could keep serving a link this exact
      // action just disabled. Blocking without invalidating would be a silent no-op
      // for any URL already in cache.
      for (const row of urlResult.rows) {
        await invalidateCachedUrl(row.short_code);
      }
    } else {
      // Symmetric reversal — no cache invalidation needed here: blocked rows are never
      // cached in the first place, so there is nothing stale to clear.
      await pool.query(
        `UPDATE urls SET moderation_status = 'approved'
         WHERE domain = $1 AND moderation_status = 'blocked'`,
        [domain]
      );
    }

    const finalResult = await pool.query<FlaggedDomainRow>(
      "SELECT * FROM flagged_domains WHERE id = $1",
      [id]
    );
    res.status(200).json(finalResult.rows[0]);
  } catch (err) {
    console.error("[handleReviewDomain] Failed:", err);
    res.status(500).json({ error: "Failed to review domain" });
  }
}
