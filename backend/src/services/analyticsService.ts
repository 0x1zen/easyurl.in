import pool from "../config/db";

interface AccessRow {
  analytics_retention_days: number;
  features: {
    analytics_requires_active_trial?: boolean;
  };
  trial_end_date: string | null;
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
    `SELECT p.analytics_retention_days, p.features, s.trial_end_date
     FROM subscribers s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [subscriberId]
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Subscriber ${subscriberId} not found`);

  // Check feature flag rather than plan name — plan names can change or be repurposed,
  // while a JSONB feature flag is an explicit, version-stable contract per plan
  if (row.features.analytics_requires_active_trial === true) {
    const trialExpired =
      row.trial_end_date === null ||
      new Date(row.trial_end_date) < new Date();

    if (trialExpired) {
      return {
        allowed: false,
        retentionDays: 0,
        reason:
          "Your free trial has ended. Analytics requires an active trial or a Pro plan.",
      };
    }
  }

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

export async function getClickAnalytics(urlId: number, retentionDays: number) {
  // node-postgres returns Postgres BIGINT (from COUNT(*)) as a JS string to avoid
  // precision loss on values > Number.MAX_SAFE_INTEGER — ::int casts to 32-bit int,
  // which pg returns as a JS number directly, eliminating the need for parseInt everywhere
  const baseParams = [urlId, retentionDays];

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
  ] = await Promise.all([
    pool.query<TotalClicksRow>(
      `SELECT COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)`,
      baseParams
    ),

    pool.query<ClicksOverTimeRow>(
      `SELECT DATE_TRUNC('day', clicked_at)::date AS date,
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY DATE_TRUNC('day', clicked_at)
       ORDER BY DATE_TRUNC('day', clicked_at) ASC`,
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
      `SELECT TRIM(TO_CHAR(clicked_at, 'Day')) AS "dayOfWeek",
              COUNT(*)::int AS count
       FROM clicks
       WHERE url_id = $1
         AND clicked_at >= NOW() - make_interval(days => $2)
       GROUP BY TRIM(TO_CHAR(clicked_at, 'Day'))
       ORDER BY count DESC`,
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
  ]);

  return {
    totalClicks: totalResult.rows[0]?.count ?? 0,
    retentionDays,
    clicksOverTime: overTimeResult.rows,
    byCountry: countryResult.rows,
    byCity: cityResult.rows,
    byDeviceType: deviceResult.rows,
    byBrowser: browserResult.rows,
    byOs: osResult.rows,
    byLanguage: languageResult.rows,
    byDayOfWeek: dowResult.rows,
    byHourOfDay: hourResult.rows,
  };
}
