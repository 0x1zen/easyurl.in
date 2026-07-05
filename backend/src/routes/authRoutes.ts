import { Router } from "express";
import { handleSignup, handleLogin } from "../controllers/authController";

const router = Router();

// Both routes are public — credentials are the proof of identity
router.post("/signup", handleSignup);
router.post("/login", handleLogin);

export default router;
