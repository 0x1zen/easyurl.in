import pool from "../config/db";
import redisClient from "../config/redis";

const CACHE_KEY = "public:stats";
const CACHE_TTL_SECONDS = 3600;

interface PublicStats {
  totalUrls: number;
  totalClicks: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached !== null) {
      return JSON.parse(cached) as PublicStats;
    }

    const [urlResult, clickResult] = await Promise.all([
      pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM urls WHERE is_anonymous = false"
      ),
      pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM clicks"
      ),
    ]);

    const stats: PublicStats = {
      totalUrls: urlResult.rows[0]?.count ?? 0,
      totalClicks: clickResult.rows[0]?.count ?? 0,
    };

    await redisClient.set(CACHE_KEY, JSON.stringify(stats), {
      EX: CACHE_TTL_SECONDS,
    });

    return stats;
  } catch (err) {
    // Stats failure must never crash the app — callers get zeros instead
    console.error("[getPublicStats] Failed:", err);
    return { totalUrls: 0, totalClicks: 0 };
  }
}
