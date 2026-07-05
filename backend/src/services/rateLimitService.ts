import pool from "../config/db";

interface RateLimitRow {
  count: number;
  oldest: string | null;
}

export async function checkAnonymousRateLimit(
  ip: string
): Promise<{ allowed: boolean; waitMinutes?: number }> {
  const result = await pool.query<RateLimitRow>(
    `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest
     FROM anonymous_url_creation_log
     WHERE ip_address = $1 AND created_at >= NOW() - INTERVAL '3 hours'`,
    [ip]
  );
  const row = result.rows[0];
  const count = row?.count ?? 0;
  const oldest = row?.oldest ?? null;

  if (count >= 3) {
    const oldestDate = oldest !== null ? new Date(oldest) : new Date();
    const windowEndsAt = new Date(oldestDate.getTime() + 3 * 60 * 60 * 1000);
    const waitMs = windowEndsAt.getTime() - Date.now();
    const waitMinutes = Math.ceil(waitMs / 60000);
    return { allowed: false, waitMinutes };
  }

  return { allowed: true };
}
