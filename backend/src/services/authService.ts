import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db";
import redisClient from "../config/redis";
import { generateApiKey } from "../utils/apiKey";

// ── Custom error types ────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AlreadyRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyRegisteredError";
  }
}

export class EmailTakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailTakenError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    // Intentionally generic — same message whether email missing or password wrong.
    // Distinct messages would let an attacker enumerate which emails have accounts.
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

interface JwtTokenPayload {
  id: number;
  planId: number;
  accountStatus: string;
}

// ── issueTrialKey ─────────────────────────────────────────────────────────────

interface TrialInsertRow {
  id: number;
  api_key: string;
  trial_end_date: string;
}

export interface TrialKeyResult {
  apiKey: string;
  trialEndDate: string;
}

export async function issueTrialKey(ip: string): Promise<TrialKeyResult> {
  // Redis handles the fast, live throttling decision; Postgres keeps the permanent
  // forensic trail via signup_ip — two different jobs using the same data point.
  const rateLimitKey = `trial_key_count:${ip}`;
  const count = await redisClient.incr(rateLimitKey);
  // Set the 24h window only on first creation. Never call expire on subsequent increments
  // or the window would keep rolling forward, preventing the limit from ever being hit.
  if (count === 1) {
    await redisClient.expire(rateLimitKey, 86400);
  }
  if (count > 3) {
    throw new RateLimitError(
      "Too many trial keys issued from this IP. Please try again in 24 hours."
    );
  }

  // Never hardcode plan ids — plan rows can be recreated with different ids
  const planResult = await pool.query<{ id: number }>(
    "SELECT id FROM plans WHERE name = 'Free'"
  );
  const freePlanId = planResult.rows[0]?.id;
  if (!freePlanId) throw new Error("Free plan not found in database");

  const apiKey = generateApiKey();

  try {
    const insertResult = await pool.query<TrialInsertRow>(
      `INSERT INTO subscribers (api_key, plan_id, trial_start_date, trial_end_date, signup_ip)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $3)
       RETURNING id, api_key, trial_end_date`,
      [apiKey, freePlanId, ip]
    );
    const row = insertResult.rows[0];
    if (!row) throw new Error("Trial key insert returned no rows");
    return { apiKey: row.api_key, trialEndDate: row.trial_end_date };
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      // 48-byte random key — collision probability is negligible in practice.
      // One defensive catch prevents an ungraceful 500 on the astronomically
      // unlikely event that randomBytes produces a duplicate key.
      throw new Error("API key collision — please retry the request");
    }
    throw err;
  }
}

// ── issueJwt ──────────────────────────────────────────────────────────────────

export function issueJwt(subscriber: {
  id: number;
  planId: number;
  accountStatus: string;
}): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET environment variable is not configured");

  const payload: JwtTokenPayload = {
    id: subscriber.id,
    planId: subscriber.planId,
    accountStatus: subscriber.accountStatus,
  };

  return jwt.sign(payload, secret, { expiresIn: "24h" });
}

// ── signupSubscriber ──────────────────────────────────────────────────────────

interface SignupRow {
  id: number;
  email: string;
  plan_id: number;
  account_status: string;
}

export async function signupSubscriber(
  subscriberId: number,
  email: string,
  password: string
): Promise<{ token: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Invalid email address");
  }
  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const existingResult = await pool.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM subscribers WHERE id = $1",
    [subscriberId]
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new Error(`Subscriber ${subscriberId} not found`);
  if (existing.password_hash !== null) {
    throw new AlreadyRegisteredError("This account is already registered");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const updateResult = await pool.query<SignupRow>(
      `UPDATE subscribers
       SET email = $1, password_hash = $2
       WHERE id = $3
       RETURNING id, email, plan_id, account_status`,
      [email, passwordHash, subscriberId]
    );
    const row = updateResult.rows[0];
    if (!row) throw new Error("Signup update returned no rows");
    return { token: issueJwt({ id: row.id, planId: row.plan_id, accountStatus: row.account_status }) };
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new EmailTakenError("This email address is already registered to another account");
    }
    throw err;
  }
}

// ── loginSubscriber ───────────────────────────────────────────────────────────

interface LoginRow {
  id: number;
  plan_id: number;
  password_hash: string | null;
  account_status: string;
}

export async function loginSubscriber(
  email: string,
  password: string
): Promise<{ token: string }> {
  const result = await pool.query<LoginRow>(
    "SELECT id, plan_id, password_hash, account_status FROM subscribers WHERE email = $1",
    [email]
  );
  const row = result.rows[0];

  // Treat "email not found" and "password mismatch" identically.
  // Distinct error messages would allow an attacker to probe which emails
  // have registered accounts (email enumeration).
  if (!row || row.password_hash === null) {
    throw new InvalidCredentialsError();
  }

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    throw new InvalidCredentialsError();
  }

  return { token: issueJwt({ id: row.id, planId: row.plan_id, accountStatus: row.account_status }) };
}
