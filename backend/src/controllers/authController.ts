import type { Request, Response } from "express";
import {
  issueTrialKey,
  signupSubscriber,
  loginSubscriber,
  RateLimitError,
  ValidationError,
  AlreadyRegisteredError,
  EmailTakenError,
  InvalidCredentialsError,
} from "../services/authService";

export async function handleIssueTrialKey(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await issueTrialKey(req.ip ?? "");
    res.status(201).json({ apiKey: result.apiKey, trialEndDate: result.trialEndDate });
  } catch (err) {
    if (err instanceof RateLimitError) {
      res.status(429).json({ error: err.message });
      return;
    }
    console.error("[handleIssueTrialKey] Failed to issue trial key:", err);
    res.status(500).json({ error: "Failed to issue trial key" });
  }
}

export async function handleSignup(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: unknown; password: unknown };

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const result = await signupSubscriber(req.subscriber!.id, email, password);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof AlreadyRegisteredError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error("[handleSignup] Signup failed:", err);
    res.status(500).json({ error: "Signup failed" });
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: unknown; password: unknown };

  if (typeof email !== "string" || typeof password !== "string") {
    // Return the same generic message as a failed login — prevents distinguishing
    // "bad request shape" from "wrong credentials" at the HTTP layer
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  try {
    const result = await loginSubscriber(email, password);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("[handleLogin] Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
}
