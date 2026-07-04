import { randomBytes } from "crypto";

export function generateApiKey(): string {
  return "sk_" + randomBytes(24).toString("hex");
}
