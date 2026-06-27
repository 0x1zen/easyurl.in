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
