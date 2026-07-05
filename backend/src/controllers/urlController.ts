import type { Request, Response } from "express";
import {
  createShortUrl,
  createAnonymousShortUrl,
  getCachedUrl,
  cacheUrl,
} from "../services/urlService";
import type { UrlRow } from "../services/urlService";
import { recordClick } from "../services/clickService";
import {
  checkActiveLimitNotExceeded,
  checkAliasPermission,
} from "../services/planService";
import { checkUrlSafety, extractDomain } from "../services/moderationService";
import { checkAnonymousRateLimit } from "../services/rateLimitService";
import pool from "../config/db";

export async function handleCreateShortUrl(
  req: Request,
  res: Response
): Promise<void> {
  const { originalUrl, customAlias } = req.body as {
    originalUrl: unknown;
    customAlias: unknown;
  };
  const accountId = req.subscriber!.id;

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
      accountId,
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

    const safety = await checkUrlSafety(originalUrl);
    if (!safety.allowed) {
      res.status(403).json({ error: safety.reason });
      return;
    }

    const domain = extractDomain(originalUrl);
    const row = await createShortUrl(
      originalUrl,
      accountId,
      typeof customAlias === "string" ? customAlias : undefined,
      domain
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

export async function handleCreateAnonymousShortUrl(
  req: Request,
  res: Response
): Promise<void> {
  const { originalUrl } = req.body as { originalUrl: unknown };

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
    const rateLimit = await checkAnonymousRateLimit(req.ip ?? "");
    if (!rateLimit.allowed) {
      res.status(429).json({
        error: `Rate limit reached. Please wait ${rateLimit.waitMinutes} minutes.`,
      });
      return;
    }

    const safety = await checkUrlSafety(originalUrl);
    if (!safety.allowed) {
      res.status(403).json({ error: safety.reason });
      return;
    }

    const row = await createAnonymousShortUrl(originalUrl, req.ip ?? "", req);
    const baseUrl = process.env["APP_BASE_URL"] ?? "";
    const shortUrl = `${baseUrl}/${row.short_code}`;

    res.status(201).json({
      shortUrl,
      shortCode: row.short_code,
      originalUrl: row.original_url,
      expiresAt: row.expiry_date,
      message: "This link expires in 24 hours. Sign up for permanent links and analytics.",
    });
  } catch (err) {
    console.error("[handleCreateAnonymousShortUrl] Failed:", err);
    res.status(500).json({ error: "Failed to create short URL" });
  }
}

export async function handleRedirect(
  req: Request,
  res: Response
): Promise<void> {
  const { code } = req.params as { code: string };

  try {
    // Cache hit path: only valid, active, non-expired rows are ever cached,
    // so skip the is_active and expiry_date checks on a hit.
    const cached = await getCachedUrl(code);
    if (cached !== null) {
      void recordClick(cached.id, req);
      res.redirect(302, cached.original_url);
      return;
    }

    // Cache miss — query Postgres
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
      if (row.is_anonymous) {
        res.status(410).json({
          error: "This link has expired. Sign up at easyurl.in for permanent links.",
        });
      } else {
        res.status(410).json({ error: "This link has expired." });
      }
      return;
    }

    if (row.moderation_status === "blocked") {
      res.status(410).json({ error: "This link has been disabled due to a security concern." });
      return;
    }

    // Only cache valid, active, non-expired, approved rows. pending_review rows still
    // redirect but are not cached — their status may change and caching would serve stale data.
    if (row.moderation_status === "approved") {
      await cacheUrl(code, row);
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
