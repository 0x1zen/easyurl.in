import pool from "../config/db";

interface PlanLimitRow {
  active_url_limit: number;
}

interface PlanFeaturesRow {
  features: {
    custom_alias?: boolean;
    manage_links?: boolean;
  };
}

interface LinkAccessRow {
  features: {
    requires_signup_after_trial?: boolean;
  };
  trial_end_date: string | null;
  password_hash: string | null;
}

export async function checkActiveLimitNotExceeded(
  subscriberId: number,
  planId: number
): Promise<boolean> {
  const planResult = await pool.query<PlanLimitRow>(
    "SELECT active_url_limit FROM plans WHERE id = $1",
    [planId]
  );
  const plan = planResult.rows[0];
  if (!plan) throw new Error(`Plan ${planId} not found`);

  // COUNT(*)::int casts bigint to int so pg returns a JS number, not a string
  const countResult = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM urls WHERE subscriber_id = $1 AND is_active = true",
    [subscriberId]
  );
  const count = countResult.rows[0]?.count ?? 0;

  return count < plan.active_url_limit;
}

export async function checkAliasPermission(planId: number): Promise<boolean> {
  const result = await pool.query<PlanFeaturesRow>(
    "SELECT features FROM plans WHERE id = $1",
    [planId]
  );
  const plan = result.rows[0];
  if (!plan) throw new Error(`Plan ${planId} not found`);
  return plan.features.custom_alias === true;
}

export async function checkManageLinksPermission(
  planId: number
): Promise<boolean> {
  const result = await pool.query<PlanFeaturesRow>(
    "SELECT features FROM plans WHERE id = $1",
    [planId]
  );
  const plan = result.rows[0];
  if (!plan) throw new Error(`Plan ${planId} not found`);
  return plan.features.manage_links === true;
}

// requires_signup_after_trial is a separate flag from analytics_requires_active_trial
// because the two gates serve different purposes: this one blocks public redirect delivery
// (affecting visitors who click the link), while analytics gating blocks feature access
// for the subscriber. Conflating them would make it impossible to offer analytics-only
// gating without also blocking redirects, or vice versa.
export async function checkLinkAccessAllowed(subscriberId: number): Promise<boolean> {
  const result = await pool.query<LinkAccessRow>(
    `SELECT p.features, s.trial_end_date, s.password_hash
     FROM subscribers s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [subscriberId]
  );
  const row = result.rows[0];
  if (!row) return false;

  // NULL trial_end_date means the subscriber never started a trial — there is no proof
  // of an active trial period, so treat it as expired. This matches the same conservative
  // pattern the analytics gate already uses (IS NULL OR < now = expired), and prevents
  // a subscriber with no trial date from accidentally bypassing the signup gate.
  if (
    row.features.requires_signup_after_trial === true &&
    (row.trial_end_date === null || new Date(row.trial_end_date) < new Date()) &&
    row.password_hash === null
  ) {
    return false;
  }

  return true;
}
