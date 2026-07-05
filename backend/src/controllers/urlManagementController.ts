import type { Request, Response } from "express";
import {
  getUrlsForSubscriber,
  getUrlById,
  softDeleteUrl,
  updateUrl,
} from "../services/urlService";
import {
  checkManageLinksPermission,
  checkAliasPermission,
  checkActiveLimitNotExceeded,
} from "../services/planService";

export async function handleListUrls(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const urls = await getUrlsForSubscriber(req.subscriber!.id);
    res.status(200).json(urls);
  } catch (err) {
    console.error("[handleListUrls] Failed to list URLs:", err);
    res.status(500).json({ error: "Failed to retrieve URLs" });
  }
}

export async function handleDeleteUrl(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params["id"];
  const id = parseInt(typeof rawId === "string" ? rawId : "", 10);

  try {
    const url = await getUrlById(id);

    // 404 (not 403) on ownership mismatch — a 403 would confirm the resource exists,
    // which leaks information about other subscribers' data
    if (!url || url.account_id !== req.subscriber!.id) {
      res.status(404).json({ error: "URL not found" });
      return;
    }

    const canManage = await checkManageLinksPermission(req.subscriber!.planId);
    if (!canManage) {
      res.status(403).json({ error: "Link management requires a Pro plan" });
      return;
    }

    // Soft delete (is_active = false) rather than hard delete to preserve click
    // analytics — clicks rows reference url_id via FK and would be lost on hard delete
    await softDeleteUrl(id, url.short_code);
    res.status(200).json({ message: "URL deactivated successfully" });
  } catch (err) {
    console.error("[handleDeleteUrl] Failed to delete URL:", err);
    res.status(500).json({ error: "Failed to delete URL" });
  }
}

export async function handleUpdateUrl(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params["id"];
  const id = parseInt(typeof rawId === "string" ? rawId : "", 10);
  const { originalUrl, newAlias, reactivate } = req.body as {
    originalUrl?: unknown;
    newAlias?: unknown;
    reactivate?: unknown;
  };

  try {
    const url = await getUrlById(id);

    // 404 (not 403) — same reasoning as handleDeleteUrl
    if (!url || url.account_id !== req.subscriber!.id) {
      res.status(404).json({ error: "URL not found" });
      return;
    }

    const canManage = await checkManageLinksPermission(req.subscriber!.planId);
    if (!canManage) {
      res.status(403).json({ error: "Link management requires a Pro plan" });
      return;
    }

    if (reactivate === false) {
      res.status(400).json({
        error: "Use DELETE /urls/:id to deactivate a link",
      });
      return;
    }

    if (reactivate === true) {
      // Re-check the active limit on reactivation — the subscriber may have hit their
      // cap since this link was deactivated; skipping the check would silently exceed it
      const withinLimit = await checkActiveLimitNotExceeded(
        req.subscriber!.id,
        req.subscriber!.planId
      );
      if (!withinLimit) {
        res.status(403).json({
          error: "Active URL limit reached. Deactivate another link first.",
        });
        return;
      }
    }

    if (newAlias !== undefined) {
      if (typeof newAlias !== "string") {
        res.status(400).json({ error: "newAlias must be a string" });
        return;
      }
      const canUseAlias = await checkAliasPermission(req.subscriber!.planId);
      if (!canUseAlias) {
        res.status(403).json({ error: "Custom aliases require a Pro plan" });
        return;
      }
    }

    // Build updates object without explicitly setting undefined properties —
    // exactOptionalPropertyTypes treats { foo: undefined } and {} as different types
    const updates: Parameters<typeof updateUrl>[2] = {};
    if (typeof originalUrl === "string") updates.originalUrl = originalUrl;
    if (typeof newAlias === "string") updates.newAlias = newAlias;
    if (reactivate === true) updates.reactivate = true;

    const updated = await updateUrl(id, url.short_code, updates);

    res.status(200).json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === "Alias already taken") {
      res.status(409).json({ error: "Alias already taken" });
      return;
    }
    console.error("[handleUpdateUrl] Failed to update URL:", err);
    res.status(500).json({ error: "Failed to update URL" });
  }
}
