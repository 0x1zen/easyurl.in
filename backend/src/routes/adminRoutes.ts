import { Router } from "express";
import { requireAdminSecret } from "../middleware/adminMiddleware";
import { handleListFlaggedDomains, handleReviewDomain } from "../controllers/adminController";

const router = Router();

router.get("/admin/flagged-domains", requireAdminSecret, handleListFlaggedDomains);
router.patch("/admin/flagged-domains/:id", requireAdminSecret, handleReviewDomain);

export default router;
