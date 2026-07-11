import path from "path";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import redisClient from "./config/redis";
import authRoutes from "./routes/authRoutes";
import statsRoutes from "./routes/statsRoutes";
import urlManagementRoutes from "./routes/urlManagementRoutes";
import urlRoutes from "./routes/urlRoutes";
import adminRoutes from "./routes/adminRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

// Browsers block cross-origin requests by default (Same-Origin Policy). This explicitly
// allows the Vite dev server to call this API with the headers our frontend needs.
app.use(
  cors({
    origin: process.env.NODE_ENV === "production"
      ? false        // same-origin in production, CORS not needed
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
app.use(statsRoutes);

// Browser refresh on /urls/:id/analytics has no Authorization header — serve React
// so it loads and makes the authenticated API fetch itself. API calls (with the
// header) pass through to urlManagementRoutes below.
app.get("/urls/:id/analytics", (req: Request, res: Response, next: NextFunction) => {
  const hasAuth = !!req.headers.authorization;
  const wantHtml = req.headers.accept?.includes("text/html") ?? false;

  if (!hasAuth && wantHtml) {
    res.sendFile(path.join(__dirname, "../frontend-dist", "index.html"));
    return;
  }
  next();
});

app.use(urlManagementRoutes);
app.use(adminRoutes);

// Explicit SPA routes that must be served before urlRoutes, because GET /:code
// is a single-segment wildcard that would otherwise match /login, /dashboard, etc.
app.get(
  ["/", "/login", "/signup", "/dashboard", "/features", "/pricing"],
  (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../frontend-dist", "index.html"));
  }
);

app.use(urlRoutes);

// Catch-all: serves React index.html for all frontend routes (/dashboard, /login, /signup, etc.)
// so React Router handles client-side routing. Must be LAST so it never intercepts API calls
// or short link redirects.
app.get("/{*path}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../frontend-dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
