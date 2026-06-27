import { Router } from "express";
import { handleCreateShortUrl, handleRedirect } from "../controllers/urlController";
import { requireApiKey } from "../middleware/authMiddleware";

const router = Router();

router.post("/shorten", requireApiKey, handleCreateShortUrl);
router.get("/:code", handleRedirect);

export default router;
