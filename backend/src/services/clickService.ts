import type { Request } from "express";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import pool from "../config/db";

export async function recordClick(urlId: number, req: Request): Promise<void> {
  try {
    const ip = req.ip ?? "";
    const ua = req.headers["user-agent"] ?? "";
    // HTTP spec historically misspelled "referrer" as "referer" — using the spec-correct header name
    const referrer = req.headers["referer"] ?? null;

    const geo = geoip.lookup(ip);
    const country = geo?.country ?? null;
    const city = geo?.city ?? null;

    const parser = new UAParser(ua);
    const result = parser.getResult();

    const browser = result.browser.name ?? null;
    const os = result.os.name ?? null;
    // ua-parser-js only sets device.type for non-desktop devices (mobile, tablet, etc.)
    // undefined means a regular desktop browser
    const deviceType = result.device.type ?? "desktop";

    await pool.query(
      `INSERT INTO clicks (url_id, country, city, device_type, browser, os, referrer)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [urlId, country, city, deviceType, browser, os, referrer]
    );
  } catch (err) {
    // Never rethrow — click recording is fire-and-forget and must not affect the redirect
    console.error("[recordClick] Failed to record click:", err);
  }
}
