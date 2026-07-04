import { Router } from "express";
import { requireApiKey } from "../middleware/authMiddleware";
import {
  handleIssueTrialKey,
  handleSignup,
  handleLogin,
} from "../controllers/authController";

const router = Router();

// Public — no subscriber exists yet when requesting a trial key
router.post("/trial-key", handleIssueTrialKey);

// requireApiKey specifically — /signup is the bridge from "has API key, no password"
// to "registered". JWT auth doesn't apply here because there's no password yet
// (and therefore no JWT) at the point of signup.
router.post("/signup", requireApiKey, handleSignup);

// Public — credentials are the proof of identity
router.post("/login", handleLogin);

export default router;
