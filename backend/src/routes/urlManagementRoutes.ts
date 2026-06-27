import { Router } from "express";
import { requireApiKey } from "../middleware/authMiddleware";
import {
  handleListUrls,
  handleDeleteUrl,
  handleUpdateUrl,
} from "../controllers/urlManagementController";

const router = Router();

router.get("/urls", requireApiKey, handleListUrls);
router.delete("/urls/:id", requireApiKey, handleDeleteUrl);
router.patch("/urls/:id", requireApiKey, handleUpdateUrl);

export default router;
