import type { Request, Response } from "express";
import { getUrlById } from "../services/urlService";
import { getAnalyticsAccess, getClickAnalytics } from "../services/analyticsService";

export async function handleGetUrlAnalytics(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params["id"];
  const urlId = parseInt(typeof rawId === "string" ? rawId : "", 10);

  try {
    const url = await getUrlById(urlId);

    // 404 on ownership mismatch — same pattern as delete/update:
    // returning 403 would confirm the resource exists, leaking another subscriber's data
    if (!url || url.account_id !== req.subscriber!.id) {
      res.status(404).json({ error: "Link not found" });
      return;
    }

    const access = await getAnalyticsAccess(
      req.subscriber!.id,
      req.subscriber!.planId
    );

    if (!access.allowed) {
      res.status(403).json({ error: access.reason });
      return;
    }

    const requestedDays = req.query["days"];
    // Math.min() is the security boundary — subscribers cannot exceed their plan's
    // retention limit by passing an arbitrary days param.
    let effectiveDays = access.retentionDays;
    if (typeof requestedDays === "string" && requestedDays.length > 0) {
      const parsed = parseInt(requestedDays, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        effectiveDays = Math.min(parsed, access.retentionDays);
      }
    }

    const analytics = await getClickAnalytics(urlId, effectiveDays);
    res.status(200).json({ ...analytics, retentionDays: effectiveDays });
  } catch (err) {
    console.error("[handleGetUrlAnalytics] Failed to fetch analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
}
