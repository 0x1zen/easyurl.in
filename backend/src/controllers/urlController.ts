import type { Request, Response } from "express";
import { createShortUrl } from "../services/urlService";
import type { UrlRow } from "../services/urlService";
import { recordClick } from "../services/clickService";
import { checkActiveLimitNotExceeded, checkAliasPermission } from "../services/planService";
import pool from "../config/db";

export async function handleCreateShortUrl(
  req: Request,
  res: Response
): Promise<void> {
  const { originalUrl, customAlias } = req.body as {
    originalUrl: unknown;
    customAlias: unknown;
  };
  const subscriberId = req.subscriber!.id;

  if (typeof originalUrl !== "string" || !originalUrl) {
    res.status(400).json({ error: "originalUrl is required" });
    return;
  }

  try {
    new URL(originalUrl);
  } catch {
    res.status(400).json({ error: "originalUrl is not a valid URL" });
    return;
  }

  try {
    const withinLimit = await checkActiveLimitNotExceeded(
      req.subscriber!.id,
      req.subscriber!.planId
    );
    if (!withinLimit) {
      res.status(403).json({ error: "Active URL limit reached for your plan" });
      return;
    }

    if (customAlias !== undefined) {
      if (typeof customAlias !== "string") {
        res.status(400).json({ error: "customAlias must be a string" });
        return;
      }
      const canUseAlias = await checkAliasPermission(req.subscriber!.planId);
      if (!canUseAlias) {
        res.status(403).json({ error: "Custom aliases require a Pro plan" });
        return;
      }
    }

    const row = await createShortUrl(
      originalUrl,
      subscriberId,
      typeof customAlias === "string" ? customAlias : undefined
    );
    const baseUrl = process.env["APP_BASE_URL"] ?? "";
    const shortUrl = `${baseUrl}/${row.short_code}`;

    res.status(201).json({
      shortUrl,
      originalUrl: row.original_url,
      shortCode: row.short_code,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Alias already taken") {
      res.status(409).json({ error: "Alias already taken" });
      return;
    }
    if (err instanceof Error && err.message.startsWith("Alias must be")) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("[handleCreateShortUrl] Failed to create short URL:", err);
    res.status(500).json({ error: "Failed to create short URL" });
  }
}

export async function handleRedirect(
  req: Request,
  res: Response
): Promise<void> {
  const { code } = req.params;

  try {
    const result = await pool.query<UrlRow>(
      "SELECT * FROM urls WHERE short_code = $1",
      [code]
    );

    const row = result.rows[0];

    if (!row) {
      res.status(404).json({ error: "Link not found" });
      return;
    }

    if (!row.is_active) {
      res.status(410).json({ error: "This link is no longer active" });
      return;
    }

    if (row.expiry_date !== null && new Date(row.expiry_date) < new Date()) {
      res.status(410).json({ error: "This link has expired" });
      return;
    }

    // Fire-and-forget: redirect must happen instantly; click logging is secondary
    // and must never add latency to the user-facing redirect
    void recordClick(row.id, req);

    // 302 (Found) rather than 301 (Moved Permanently) because browsers cache 301s
    // indefinitely — a cached 301 would redirect the user locally, bypassing the
    // server entirely and making click tracking impossible without a browser restart
    res.redirect(302, row.original_url);
  } catch (err) {
    console.error(`[handleRedirect] Failed to resolve code "${code}":`, err);
    res.status(500).json({ error: "Failed to resolve link" });
  }
}
