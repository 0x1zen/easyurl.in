import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

// encodeURIComponent handles special characters in the password (e.g. @, #, %)
// that would otherwise break URL parsing and be misread as delimiters
const url = `redis://default:${encodeURIComponent(process.env["REDIS_PASSWORD"] ?? "")}@${process.env["REDIS_HOST"]}:${process.env["REDIS_PORT"]}`;

const client = createClient({ url });

// Without this listener Node will crash the process on any unhandled 'error' event
// (Redis emits one on every connection drop, not just the initial connect).
client.on("error", (err: Error) => {
  console.error("[Redis] Client error:", err.message);
});

client
  .connect()
  .then(() => console.log("[Redis] Connected successfully"))
  .catch((err: Error) => console.error("[Redis] Initial connection failed:", err.message));

export default client;
