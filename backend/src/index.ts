import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";
import urlRoutes from "./routes/urlRoutes";
import urlManagementRoutes from "./routes/urlManagementRoutes";

// dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use(urlManagementRoutes);
app.use(urlRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});