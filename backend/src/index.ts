import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import redisClient from "./config/redis";
import authRoutes from "./routes/authRoutes";
import urlManagementRoutes from "./routes/urlManagementRoutes";
import urlRoutes from "./routes/urlRoutes";
import adminRoutes from "./routes/adminRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

// Browsers block cross-origin requests by default (Same-Origin Policy). This explicitly
// allows the Vite dev server to call this API with the headers our frontend needs.
app.use(
  cors({
    origin: "http://localhost:5173",
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    credentials: true,
  })
);

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/redis-test", async (_req: Request, res: Response) => {
  try {
    await redisClient.set("test-key", "hello from redis");
    const value = await redisClient.get("test-key");
    res.json({ value });
  } catch (err) {
    console.error("[redis-test] Redis operation failed:", err);
    res.status(500).json({ error: "Redis operation failed" });
  }
});

app.use(authRoutes);
app.use(urlManagementRoutes);
app.use(urlRoutes);
app.use(adminRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
