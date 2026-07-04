import path from "path";
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
    origin: process.env.NODE_ENV === "production" 
      ? "https://easyurl.in" 
      : "http://localhost:5173",
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    credentials: true,
  })
);

app.use(express.json());

// Serves React static files (JS, CSS, assets) for production
app.use(express.static(path.join(__dirname, "../frontend-dist")));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use(authRoutes);
app.use(urlManagementRoutes);
app.use(urlRoutes);
app.use(adminRoutes);

// Catch-all: serves React index.html for all frontend routes (/dashboard, /login, /signup, etc.)
// so React Router handles client-side routing. Must be LAST so it never intercepts API calls
// or short link redirects.
app.get("/{*path}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../frontend-dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
