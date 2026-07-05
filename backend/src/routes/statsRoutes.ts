import { Router } from "express";
import { handleGetStats } from "../controllers/statsController";

const router = Router();

// Public — no authentication required
router.get("/stats", handleGetStats);

export default router;
