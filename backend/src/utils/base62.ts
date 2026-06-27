import { randomInt } from "crypto";

const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// crypto.randomInt uses a CSPRNG (cryptographically secure pseudo-random number generator),
// unlike Math.random which is predictable — short codes must not be guessable
export function generateRandomCode(length: number = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[randomInt(0, chars.length)];
  }
  return code;
}
