import pool from "../config/db";

interface AccessRow {
  analytics_retention_days: number;
}

interface AnalyticsAccessResult {
  allowed: boolean;
  retentionDays: number;
  reason?: string;
}

export async function getAnalyticsAccess(
  subscriberId: number,
  planId: number
): Promise<AnalyticsAccessResult> {
  const result = await pool.query<AccessRow>(
    `SELECT p.analytics_retention_days
     FROM subscribers s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [subscriberId]
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Subscriber ${subscriberId} not found`);

  return { allowed: true, retentionDays: row.analytics_retention_days };
}

// ── row shapes for each analytics query ──────────────────────────────────────

interface TotalClicksRow {
  count: number;
}

interface ClicksOverTimeRow {
  date: string;
  count: number;
}

interface CountryRow {
  country: string;
  count: number;
}

interface CityRow {
  city: string;
  count: number;
}

interface DeviceTypeRow {
  deviceType: string;
  count: number;
}

interface BrowserRow {
  browser: string;
  count: number;
}

interface OsRow {
  os: string;
  count: number;
}

interface LanguageRow {
  language: string;
  count: number;
}

interface DayOfWeekRow {
  dayOfWeek: string;
  count: number;
}

interface HourOfDayRow {
  hour: number;
  count: number;
}

interface DestinationChangeRow {
  id: number;
  old_url: string;
  new_url: string;
  changed_at: Date;
}

export async function getClickAnalytics(urlId: number, retentionDays: number) {
  // node-postgres returns Postgres BIGINT (from COUNT(*)) as a JS string to avoid
  // precision loss on values > Number.MAX_SAFE_INTEGER — ::int casts to 32-bit int,
  // which pg returns as a JS number directly, eliminating the need for parseInt everywhere
  const baseParams = [urlId, retentionDays];

  const bucketSize: "day" | "week" | "month" =
    retentionDays <= 31 ? "day" : retentionDays <= 180 ? "week" : "month";

  const [
    totalResult,
    overTimeResult,
    countryResult,
    cityResult,
    deviceResult,
    browserResult,
    osResult,
    languageResult,
    dowResult,
    hourResult,
    destResult,
  ] = await Promise.all([
    pool.query<TotalClicksRow>(
      `SELECT COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)`,
      baseParams
    ),

    pool.query<ClicksOverTimeRow>(
      bucketSize === "day"
        ? `SELECT DATE_TRUNC('day', clicked_at)::date AS date,
                  COUNT(*)::int AS count
           FROM clicks
           WHERE url_id = $1
             AND clicked_at >= NOW() - make_interval(days => $2)
           GROUP BY DATE_TRUNC('day', clicked_at)
           ORDER BY DATE_TRUNC('day', clicked_at) ASC`
        : bucketSize === "week"
        ? `SELECT DATE_TRUNC('week', clicked_at)::date AS date,
                  COUNT(*)::int AS count
           FROM clicks
           WHERE url_id = $1
             AND clicked_at >= NOW() - make_interval(days => $2)
           GROUP BY DATE_TRUNC('week', clicked_at)
           ORDER BY DATE_TRUNC('week', clicked_at) ASC`
        : `SELECT DATE_TRUNC('month', clicked_at)::date AS date,
                  COUNT(*)::int AS count
           FROM clicks
           WHERE url_id = $1
             AND clicked_at >= NOW() - make_interval(days => $2)
           GROUP BY DATE_TRUNC('month', clicked_at)
           ORDER BY DATE_TRUNC('month', clicked_at) ASC`,
      baseParams
    ),

    pool.query<CountryRow>(
      `SELECT COALESCE(country, 'Unknown') AS country,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(country, 'Unknown')
       ORDER BY count DESC
       LIMIT 10`,
      baseParams
    ),

    pool.query<CityRow>(
      `SELECT COALESCE(city, 'Unknown') AS city,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(city, 'Unknown')
       ORDER BY count DESC
       LIMIT 10`,
      baseParams
    ),

    pool.query<DeviceTypeRow>(
      `SELECT COALESCE(device_type, 'Unknown') AS "deviceType",
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(device_type, 'Unknown')
       ORDER BY count DESC`,
      baseParams
    ),

    pool.query<BrowserRow>(
      `SELECT COALESCE(browser, 'Unknown') AS browser,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(browser, 'Unknown')
       ORDER BY count DESC`,
      baseParams
    ),

    pool.query<OsRow>(
      `SELECT COALESCE(os, 'Unknown') AS os,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(os, 'Unknown')
       ORDER BY count DESC`,
      baseParams
    ),

    pool.query<LanguageRow>(
      `SELECT COALESCE(language, 'Unknown') AS language,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY COALESCE(language, 'Unknown')
       ORDER BY count DESC
       LIMIT 10`,
      baseParams
    ),

    pool.query<DayOfWeekRow>(
      `SELECT d.day_name AS "dayOfWeek", COALESCE(c.count, 0) AS count
       FROM (VALUES
         (0,'Sunday'),(1,'Monday'),(2,'Tuesday'),(3,'Wednesday'),
         (4,'Thursday'),(5,'Friday'),(6,'Saturday')
       ) AS d(dow, day_name)
       LEFT JOIN (
         SELECT EXTRACT(DOW FROM clicked_at)::int AS dow,
                COUNT(*)::int AS count
         FROM clicks
         WHERE url_id = $1
           AND clicked_at >= NOW() - make_interval(days => $2)
         GROUP BY EXTRACT(DOW FROM clicked_at)::int
       ) c USING (dow)
       ORDER BY d.dow`,
      baseParams
    ),

    pool.query<HourOfDayRow>(
      `SELECT EXTRACT(HOUR FROM clicked_at)::int AS hour,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY EXTRACT(HOUR FROM clicked_at)::int
       ORDER BY hour ASC`,
      baseParams
    ),

    pool.query<DestinationChangeRow>(
      `SELECT id, old_url, new_url, changed_at
       FROM url_destination_changes
       WHERE url_id = $1
         AND changed_at >= NOW() - make_interval(days => $2)
       ORDER BY changed_at ASC`,
      baseParams
    ),
  ]);

  return {
    totalClicks: totalResult.rows[0]?.count ?? 0,
    retentionDays,
    bucketSize,
    clicksOverTime: overTimeResult.rows,
    byCountry: countryResult.rows,
    byCity: cityResult.rows,
    byDeviceType: deviceResult.rows,
    byBrowser: browserResult.rows,
    byOs: osResult.rows,
    byLanguage: languageResult.rows,
    byDayOfWeek: dowResult.rows,
    byHourOfDay: hourResult.rows,
    destinationChanges: destResult.rows.map((r) => ({
      id: r.id,
      oldUrl: r.old_url,
      newUrl: r.new_url,
      changedAt: r.changed_at instanceof Date ? r.changed_at.toISOString() : String(r.changed_at),
    })),
  };
}
