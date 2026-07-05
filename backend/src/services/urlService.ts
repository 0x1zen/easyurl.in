import type { Request } from "express";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";
import pool from "../config/db";
import redisClient from "../config/redis";
import { generateRandomCode } from "../utils/base62";
import { extractDomain } from "./moderationService";

export interface UrlRow {
  id: number;
  original_url: string;
  short_code: string;
  account_id: number | null;
  is_anonymous: boolean;
  created_by_ip: string | null;
  created_by_browser: string | null;
  created_by_device: string | null;
  created_by_country: string | null;
  is_custom_alias: boolean;
  moderation_status: string;
  expiry_date: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  domain: string | null;
}

export interface UrlRowWithCount extends UrlRow {
  click_count: number;
}

const MAX_RETRIES = 5;
const UNIQUE_VIOLATION = "23505";
const ALIAS_FORMAT = /^[a-zA-Z0-9-]{3,30}$/;

// Narrows an unknown catch value to something carrying a Postgres error code
function isPostgresError(err: unknown): err is { code: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function createShortUrl(
  originalUrl: string,
  accountId: number,
  customAlias?: string,
  domain?: string
): Promise<UrlRow> {
  // Custom alias path: single attempt, no retry — a collision means the alias is taken
  if (customAlias !== undefined) {
    if (!ALIAS_FORMAT.test(customAlias)) {
      throw new Error(
        "Alias must be 3–30 characters and contain only letters, numbers, or hyphens"
      );
    }
    try {
      const result = await pool.query<UrlRow>(
        `INSERT INTO urls (original_url, short_code, account_id, is_custom_alias, domain)
         VALUES ($1, $2, $3, true, $4)
         RETURNING *`,
        [originalUrl, customAlias, accountId, domain ?? null]
      );
      const row = result.rows[0];
      if (!row) throw new Error("INSERT returned no rows");
      return row;
    } catch (err) {
      if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
        throw new Error("Alias already taken");
      }
      throw err;
    }
  }

  // Random code path: retry on collision up to MAX_RETRIES times
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const shortCode = generateRandomCode();

    try {
      // Parameterized query ($1, $2, $3) keeps user input out of the SQL string,
      // preventing SQL injection no matter what originalUrl contains
      const result = await pool.query<UrlRow>(
        `INSERT INTO urls (original_url, short_code, account_id, domain)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [originalUrl, shortCode, accountId, domain ?? null]
      );

      const row = result.rows[0];
      if (!row) throw new Error("INSERT returned no rows");
      return row;
    } catch (err) {
      // 23505 = unique_violation: the generated short_code already exists.
      // This is safe to retry — generate a fresh code and try again.
      // Any other error (FK violation, bad data, network issue) should surface immediately.
      if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to generate a unique short code after ${MAX_RETRIES} attempts`
          );
        }
        continue;
      }
      throw err;
    }
  }

  // Unreachable — the loop always returns or throws — but TypeScript requires this
  throw new Error("Unreachable");
}

export async function createAnonymousShortUrl(
  originalUrl: string,
  ip: string,
  req: Request
): Promise<UrlRow> {
  const ua = req.headers["user-agent"] ?? "";
  const parser = new UAParser(ua);
  const browser = parser.getBrowser().name ?? "Unknown";
  const device = parser.getDevice().type ?? "desktop";
  const country = geoip.lookup(ip)?.country ?? null;
  const domain = extractDomain(originalUrl);
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const shortCode = generateRandomCode();

    try {
      const result = await pool.query<UrlRow>(
        `INSERT INTO urls (
           original_url, short_code, domain,
           account_id, is_anonymous,
           created_by_ip, created_by_browser, created_by_device, created_by_country,
           expiry_date, moderation_status, is_active
         )
         VALUES ($1, $2, $3, NULL, true, $4, $5, $6, $7, $8, 'approved', true)
         RETURNING *`,
        [originalUrl, shortCode, domain, ip, browser, device, country, expiry]
      );
      const row = result.rows[0];
      if (!row) throw new Error("INSERT returned no rows");

      // Log for IP-based rate limiting
      await pool.query(
        "INSERT INTO anonymous_url_creation_log (ip_address, short_code) VALUES ($1, $2)",
        [ip, shortCode]
      );

      return row;
    } catch (err) {
      if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to generate a unique short code after ${MAX_RETRIES} attempts`
          );
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unreachable");
}

export async function getUrlsForSubscriber(
  subscriberId: number
): Promise<UrlRowWithCount[]> {
  const result = await pool.query<UrlRowWithCount>(
    `SELECT u.*, COALESCE(c.click_count, 0)::int AS click_count
     FROM urls u
     LEFT JOIN (
       SELECT url_id, COUNT(*)::int AS click_count
       FROM clicks
       GROUP BY url_id
     ) c ON c.url_id = u.id
     WHERE u.account_id = $1
     ORDER BY u.created_at DESC`,
    [subscriberId]
  );
  return result.rows;
}

export async function getUrlById(
  id: number
): Promise<UrlRow | undefined> {
  const result = await pool.query<UrlRow>(
    "SELECT * FROM urls WHERE id = $1",
    [id]
  );
  return result.rows[0];
}

export async function softDeleteUrl(id: number, shortCode: string): Promise<void> {
  await pool.query(
    "UPDATE urls SET is_active = false, updated_at = NOW() WHERE id = $1",
    [id]
  );
  await invalidateCachedUrl(shortCode);
}

export async function updateUrl(
  id: number,
  shortCode: string,
  updates: { originalUrl?: string; newAlias?: string; reactivate?: boolean }
): Promise<UrlRowWithCount> {
  // Fetch the current destination before the update so we can record the change
  let currentOriginalUrl: string | null = null;
  if (updates.originalUrl !== undefined) {
    const currentResult = await pool.query<{ original_url: string }>(
      "SELECT original_url FROM urls WHERE id = $1",
      [id]
    );
    currentOriginalUrl = currentResult.rows[0]?.original_url ?? null;
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.originalUrl !== undefined) {
    setClauses.push(`original_url = $${paramIndex++}`);
    values.push(updates.originalUrl);
  }

  if (updates.newAlias !== undefined) {
    if (!ALIAS_FORMAT.test(updates.newAlias)) {
      throw new Error(
        "Alias must be 3–30 characters and contain only letters, numbers, or hyphens"
      );
    }
    setClauses.push(`short_code = $${paramIndex++}`);
    values.push(updates.newAlias);
    setClauses.push("is_custom_alias = true");
  }

  if (updates.reactivate === true) {
    setClauses.push("is_active = true");
  }

  setClauses.push("updated_at = NOW()");
  values.push(id);

  const sql = `UPDATE urls SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

  try {
    const result = await pool.query<UrlRow>(sql, values);
    const row = result.rows[0];
    if (!row) throw new Error("UPDATE returned no rows");
    // Invalidate aggressively on any mutation rather than reasoning case-by-case about
    // which field actually changed — simpler and safer.
    await invalidateCachedUrl(shortCode);

    // Record the destination change if the URL was actually different
    if (
      updates.originalUrl !== undefined &&
      currentOriginalUrl !== null &&
      updates.originalUrl !== currentOriginalUrl
    ) {
      try {
        await pool.query(
          `INSERT INTO url_destination_changes (url_id, old_url, new_url)
           VALUES ($1, $2, $3)`,
          [id, currentOriginalUrl, updates.originalUrl]
        );
      } catch (err) {
        console.error("[updateUrl] Failed to log destination change:", err);
      }
    }

    const countResult = await pool.query<{ click_count: number }>(
      "SELECT COUNT(*)::int AS click_count FROM clicks WHERE url_id = $1",
      [id]
    );
    const click_count = countResult.rows[0]?.click_count ?? 0;
    return { ...row, click_count };
  } catch (err) {
    if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
      throw new Error("Alias already taken");
    }
    throw err;
  }
}

export async function getCachedUrl(shortCode: string): Promise<UrlRow | null> {
  try {
    const cached = await redisClient.get(`url:${shortCode}`);
    if (cached === null) return null;
    return JSON.parse(cached) as UrlRow;
  } catch (err) {
    console.error("[getCachedUrl] Redis error — treating as cache miss:", err);
    return null;
  }
}

export async function cacheUrl(shortCode: string, urlRow: UrlRow): Promise<void> {
  try {
    await redisClient.set(`url:${shortCode}`, JSON.stringify(urlRow), { EX: 900 });
  } catch (err) {
    console.error("[cacheUrl] Redis error — skipping cache write:", err);
  }
}

export async function invalidateCachedUrl(shortCode: string): Promise<void> {
  try {
    await redisClient.del(`url:${shortCode}`);
  } catch (err) {
    console.error("[invalidateCachedUrl] Redis error — skipping invalidation:", err);
  }
}
