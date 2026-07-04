import { Router } from "express";
import { handleCreateShortUrl, handleRedirect } from "../controllers/urlController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.post("/shorten", authenticate, handleCreateShortUrl);
router.get("/:code", handleRedirect);

export default router;
