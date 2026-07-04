import { Pool, types } from "pg";
import { createClient } from "redis";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

// Match the BIGINT parser from db.ts so row counts come back as numbers
types.setTypeParser(20, (val: string) => parseInt(val, 10));

const pool = new Pool({
  host: process.env["DB_HOST"],
  port: parseInt(process.env["DB_PORT"] ?? "5432"),
  database: process.env["DB_NAME"],
  user: process.env["DB_USER"],
  password: process.env["DB_PASSWORD"],
});

const redisUrl = `redis://default:${encodeURIComponent(process.env["REDIS_PASSWORD"] ?? "")}@${process.env["REDIS_HOST"]}:${process.env["REDIS_PORT"]}`;
const redis = createClient({ url: redisUrl });
redis.on("error", () => {});

async function deleteUrlsForApiKey(apiKey: string): Promise<void> {
  await pool.query(
    `DELETE FROM clicks
     WHERE url_id IN (
       SELECT id FROM urls
       WHERE subscriber_id = (SELECT id FROM subscribers WHERE api_key = $1)
     )`,
    [apiKey]
  );
  const result = await pool.query(
    `DELETE FROM urls
     WHERE subscriber_id = (SELECT id FROM subscribers WHERE api_key = $1)
     RETURNING id`,
    [apiKey]
  );
  console.log(`  [${apiKey}] deleted ${result.rowCount ?? 0} URL(s)`);
}

async function main(): Promise<void> {
  console.log("Connecting...");
  await redis.connect();
  console.log("Connected to Redis\n");

  console.log("--- Clearing test subscriber URLs ---");
  await deleteUrlsForApiKey("pro-test-key-456");
  await deleteUrlsForApiKey("test-key-123");
  await deleteUrlsForApiKey("expired-test-key-789");

  console.log("\n--- Clearing trial subscribers (sk_%) ---");
  await pool.query(
    `DELETE FROM clicks
     WHERE url_id IN (
       SELECT id FROM urls
       WHERE subscriber_id IN (SELECT id FROM subscribers WHERE api_key LIKE 'sk_%')
     )`
  );
  await pool.query(
    `DELETE FROM urls
     WHERE subscriber_id IN (SELECT id FROM subscribers WHERE api_key LIKE 'sk_%')`
  );
  const trialResult = await pool.query(
    `DELETE FROM subscribers WHERE api_key LIKE 'sk_%' RETURNING id`
  );
  console.log(`  deleted ${trialResult.rowCount ?? 0} trial subscriber(s)`);

  console.log("\n--- Clearing moderation data ---");
  const muResult = await pool.query(
    `DELETE FROM malicious_urls WHERE domain = 'testsafebrowsing.appspot.com' RETURNING id`
  );
  console.log(`  malicious_urls: deleted ${muResult.rowCount ?? 0} row(s)`);

  const fdResult = await pool.query(
    `DELETE FROM flagged_domains WHERE domain = 'testsafebrowsing.appspot.com' RETURNING id`
  );
  console.log(`  flagged_domains: deleted ${fdResult.rowCount ?? 0} row(s)`);

  console.log("\n--- Clearing Redis rate-limit counter ---");
  const deleted = await redis.del("trial_key_count:::1");
  console.log(deleted ? "  deleted trial_key_count:::1" : "  key not present (nothing to clear)");

  console.log("\n--- Seeding Folder 11 prerequisites ---");

  // Seed 3 malicious_urls rows so the count reaches 4 after item 1 (malware.html) and
  // 5 after item 5 (phishing.html), which triggers the auto-escalation to pending_review.
  // Items 1 and 5 must NOT be pre-loaded here or the exact-URL check (step 2) would catch
  // them before GSB (step 3), producing "under review" instead of "flagged as unsafe".
  await pool.query(
    `INSERT INTO malicious_urls (domain, original_url, source, threat_type)
     VALUES
       ('testsafebrowsing.appspot.com', 'http://testsafebrowsing.appspot.com/s/seed1.html', 'google_safe_browsing', 'MALWARE'),
       ('testsafebrowsing.appspot.com', 'http://testsafebrowsing.appspot.com/s/seed2.html', 'google_safe_browsing', 'MALWARE'),
       ('testsafebrowsing.appspot.com', 'http://testsafebrowsing.appspot.com/s/seed3.html', 'google_safe_browsing', 'MALWARE')
     ON CONFLICT DO NOTHING`
  );
  console.log("  malicious_urls: seeded 3 rows (domain count now 3 — items 1 and 5 will bring it to 4 then 5, triggering escalation on item 5)");

  const seedResult = await pool.query(
    `INSERT INTO urls (original_url, short_code, subscriber_id, domain, is_active)
     SELECT 'http://testsafebrowsing.appspot.com/s/malware.html',
            'blocked-test',
            id,
            'testsafebrowsing.appspot.com',
            true
     FROM subscribers WHERE api_key = 'pro-test-key-456'
     ON CONFLICT (short_code) DO NOTHING
     RETURNING id`
  );
  console.log(
    seedResult.rowCount
      ? "  urls: blocked-test seeded"
      : "  urls: blocked-test already exists (skipped)"
  );

  console.log("\nDone. Ready to run the Postman collection.\n");
}

main()
  .catch((err: unknown) => {
    console.error("\nCleanup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await redis.disconnect();
  });
