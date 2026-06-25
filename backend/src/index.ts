import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // convert process.env.PORT to number, fallback to 3000

app.get("/health", (req: Request, res: Response) => {
    return res.json({status : "ok"});
  // return { status: "ok" } as JSON
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});