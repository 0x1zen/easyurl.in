import pool from "../config/db";

interface SafeBrowsingMatch {
  threatType: string;
}

interface SafeBrowsingResponse {
  matches?: SafeBrowsingMatch[];
}

export function extractDomain(url: string): string {
  return new URL(url).hostname;
}

export async function checkUrlSafety(
  originalUrl: string
): Promise<{ allowed: boolean; reason?: string }> {
  const domain = extractDomain(originalUrl);

  // Step 1: Check flagged_domains — blocked/pending_review short-circuit immediately.
  // approved short-circuits too, skipping the remaining (slower) checks.
  const domainResult = await pool.query<{ status: string }>(
    "SELECT status FROM flagged_domains WHERE domain = $1",
    [domain]
  );
  const flaggedRow = domainResult.rows[0];
  if (flaggedRow !== undefined) {
    if (flaggedRow.status === "blocked") {
      return {
        allowed: false,
        reason: "This domain has been blocked due to repeated malicious activity.",
      };
    }
    if (flaggedRow.status === "pending_review") {
      return {
        allowed: false,
        reason: "This domain is under review due to past flagged activity. Please try again later.",
      };
    }
    if (flaggedRow.status === "approved") {
      return { allowed: true };
    }
  }

  // Step 2: Exact-URL match against previously recorded malicious URLs.
  const maliciousResult = await pool.query<{ id: number }>(
    "SELECT id FROM malicious_urls WHERE original_url = $1",
    [originalUrl]
  );
  if (maliciousResult.rows.length > 0) {
    return { allowed: false, reason: "This URL has been flagged as unsafe." };
  }

  // Step 3: Live Google Safe Browsing check.
  // Deliberate fail-open: a third-party outage must never block core URL creation,
  // same philosophy as Redis being best-effort — infrastructure failures are logged,
  // not surfaced as errors to users.
  try {
    const apiKey = process.env["GOOGLE_SAFE_BROWSING_API_KEY"] ?? "";
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "easyurl", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url: originalUrl }],
          },
        }),
      }
    );
    const data = (await response.json()) as SafeBrowsingResponse;

    if (data.matches && data.matches.length > 0) {
      const threatType = data.matches[0]?.threatType ?? "UNKNOWN";

      await pool.query(
        `INSERT INTO malicious_urls (domain, original_url, source, threat_type)
         VALUES ($1, $2, 'google_safe_browsing', $3)`,
        [domain, originalUrl, threatType]
      );

      const countResult = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM malicious_urls WHERE domain = $1",
        [domain]
      );
      const count = countResult.rows[0]?.count ?? 0;

      if (count >= 5) {
        await pool.query(
          `INSERT INTO flagged_domains (domain, status)
           VALUES ($1, 'pending_review')
           ON CONFLICT (domain) DO NOTHING`,
          [domain]
        );
      }

      return { allowed: false, reason: "This URL has been flagged as unsafe." };
    }

    return { allowed: true };
  } catch (err) {
    console.error("[checkUrlSafety] Google Safe Browsing check failed — failing open:", err);
    return { allowed: true };
  }
}
