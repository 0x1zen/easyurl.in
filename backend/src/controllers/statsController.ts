import type { Request, Response } from "express";
import { getPublicStats } from "../services/statsService";

export async function handleGetStats(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const stats = await getPublicStats();
    res.status(200).json(stats);
  } catch (err) {
    console.error("[handleGetStats] Unexpected error:", err);
    res.status(500).json({ error: "Failed to retrieve stats" });
  }
}
