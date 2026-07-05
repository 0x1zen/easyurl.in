import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db";

// ── Error types ───────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
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

// ── issueJwt ──────────────────────────────────────────────────────────────────

export function issueJwt(subscriber: {
  id: number;
  planId: number;
  accountStatus: string;
}): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET environment variable is not configured");

  return jwt.sign(
    { id: subscriber.id, planId: subscriber.planId, accountStatus: subscriber.accountStatus },
    secret,
    { expiresIn: "24h" }
  );
}

// ── signupSubscriber ──────────────────────────────────────────────────────────

interface SignupRow {
  id: number;
  plan_id: number;
}

export async function signupSubscriber(
  email: string,
  password: string,
  ip: string
): Promise<{ token: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Invalid email address");
  }
  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const planResult = await pool.query<{ id: number }>(
    "SELECT id FROM plans WHERE name = 'Free'"
  );
  const freePlanId = planResult.rows[0]?.id;
  if (!freePlanId) throw new Error("Free plan not found in database");

  try {
    const result = await pool.query<SignupRow>(
      `INSERT INTO subscribers (email, password_hash, plan_id, account_status, signup_ip)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id, plan_id`,
      [email, passwordHash, freePlanId, ip]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Subscriber insert returned no rows");
    return {
      token: issueJwt({ id: row.id, planId: row.plan_id, accountStatus: "active" }),
    };
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new EmailTakenError("This email address is already registered");
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

  return {
    token: issueJwt({ id: row.id, planId: row.plan_id, accountStatus: row.account_status }),
  };
}
