import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  handleListUrls,
  handleDeleteUrl,
  handleUpdateUrl,
} from "../controllers/urlManagementController";
import { handleGetUrlAnalytics } from "../controllers/analyticsController";

const router = Router();

router.get("/urls", authenticate, handleListUrls);
router.get("/urls/:id/analytics", authenticate, handleGetUrlAnalytics);
router.delete("/urls/:id", authenticate, handleDeleteUrl);
router.patch("/urls/:id", authenticate, handleUpdateUrl);

export default router;
