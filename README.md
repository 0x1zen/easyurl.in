# easyurl.in

A full-stack URL shortener built as a portfolio project. Focuses on the engineering decisions that come up in production systems: cache invalidation, enumeration resistance, async write tradeoffs, and analytics at variable time scales.

**Live:** https://easyurl.in  
**Source:** https://github.com/0x1zen/easyurl.in

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express 5, TypeScript |
| Database | PostgreSQL (Oracle Cloud ARM64 VM) |
| Cache | Redis (same VM) |
| Frontend | React 19, Vite, TypeScript |
| Deployment | Docker (backend), nginx reverse proxy |
| SSL | Let's Encrypt via Certbot |

---

## Screenshots

![easyurl.in](./docs/screenshots/collage-2-featured.png)

---

## Features

**Anonymous shortening**
- No account required; links expire in 24 hours
- IP-based rate limiting: 3 links per 3 hours, tracked in Postgres

**Authenticated accounts**
- JWT authentication (signup / login)
- 5 permanent links per free account
- Custom short aliases (e.g. `easyurl.in/my-brand`)
- Edit link destination, deactivate / reactivate links

**Click analytics**
- Total clicks, trend vs period start
- Breakdown by country (flag icons), device type, browser (brand icons), OS, language (via `Intl.DisplayNames`)
- Clicks by day of week 
- Time-bucketed timeline: daily / weekly / monthly depending on date range
- Destination change markers — amber dashed `ReferenceLine` on the timeline when a link's destination was edited

**Safety & moderation**
- Google Safe Browsing v4 checked on every URL submission
- Domain escalation: 5+ flags on the same domain → admin review queue
- Admin endpoints for flagged domain review (secret-key gated)

**Landing page**
- Animated odometer counter (requestAnimationFrame, no library)
- Real-time public stats (total links, total clicks), cached in Redis and refreshed hourly
- QR code generation on demand (lazy — only rendered when explicitly requested)

**Responsive design** across desktop and mobile

---

## Architecture

```
Browser ──HTTPS──▶ nginx (reverse proxy)
                        │
                        │  proxies all traffic → localhost:3000
                        │
                   ┌────▼─────────────────────────────────────┐
                   │             Express :3000                 │
                   │  serves static Vite build + all API routes│
                   └────┬─────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │                           │
   ┌──────▼──────┐           ┌────────▼───────┐
   │ PostgreSQL  │           │     Redis       │
   │  (primary   │           │  redirect cache │
   │   store)    │           │  + stats cache  │
   └─────────────┘           └─────────────────┘
```

### Request path for a redirect

```
GET /XnCZ8LG
  → Redis lookup (url:<code>)
      HIT  → 302 redirect (< 1ms)
      MISS → Postgres query → 302 redirect + async Redis write + async click log
```

---

## Engineering Decisions

### 1. Short code generation

Short codes are generated with `crypto.randomInt` (cryptographically secure PRNG) rather than Base62-encoding the row ID. Sequential ID encoding leaks insertion order and enables trivial enumeration — anyone can walk the entire link space by incrementing. On collision (5-attempt cap, then error), the generator retries with a fresh random code.

Considered and rejected: Snowflake-style distributed IDs. They solve the collision problem, but they encode a timestamp in the high bits, which still leaks creation time, and they add coordination overhead that makes no sense on a single-server deployment.

### 2. Cache-aside with deliberate staleness

Redis caches redirect lookups with a 15-minute TTL. Only URLs that are valid, active, non-expired, and `moderation_status = 'approved'` are ever written to cache — there is no "blocked" state in cache by design. On soft-delete, destination edit, or admin block, the cache key is immediately invalidated.

The 15-minute staleness window is a conscious tradeoff against the classic cache-aside race condition (read-miss → DB fetch → concurrent write → stale cache write). Solving this race correctly requires distributed locking (e.g. Redlock), which adds failure modes. For a redirect service the bounded 15-minute exposure window is the simpler and more operationally safe choice.

### 3. Analytics time bucketing

The backend inspects `retentionDays` and switches the `clicksOverTime` query between `DATE_TRUNC('day')`, `DATE_TRUNC('week')`, and `DATE_TRUNC('month')` — returning at most ~31, ~26, or ~12 data points respectively. Without this, a 365-day range returns 365 daily rows that compress to sub-pixel width in a 600px chart. A `bucketSize` field is included in the API response so the frontend can format axis labels appropriately: `"Jul 5"` / `"Jul W2"` / `"Jul '26"`.

### 4. Destination change tracking

Every time a link's `original_url` is updated, the old and new values are written to `url_destination_changes`. The analytics timeline renders a `ReferenceLine` at the nearest matching bucket to mark when the change occurred. This lets users correlate traffic changes with destination edits. Historical click data is preserved regardless of how many times the destination changes — clicks reference `url_id`, not `original_url`.

### 5. Fire-and-forget click logging

`recordClick()` is called with `void` (not awaited) — the 302 redirect goes out immediately and the analytics write happens asynchronously. The known consequence: a process crash between sending the redirect and completing the DB write loses that click. This is an acceptable tradeoff for an analytics workload (unlike financial transactions where the same pattern would be a bug). Durability can be added later with a BullMQ queue backed by Redis persistence, without changing the redirect path.

### 6. BIGINT parsing

node-postgres returns Postgres `BIGINT` columns as JavaScript strings to avoid 64-bit precision loss. Rather than scattering `Number()` coercions across every service file, a single global type parser override (`types.setTypeParser(20, parseInt)`) is registered at startup. The precision tradeoff (silent truncation above `Number.MAX_SAFE_INTEGER`) is documented and justified by the realistic ID range of this application.

---

## Folder Structure

```
url-shortener/
├── backend/
│   └── src/
│       ├── config/         # DB pool (pg), Redis client
│       ├── controllers/    # HTTP layer — thin, delegates to services
│       ├── middleware/     # JWT auth, admin secret gate
│       ├── routes/         # Route definitions
│       ├── services/       # Business logic
│       │   ├── urlService.ts
│       │   ├── analyticsService.ts
│       │   ├── moderationService.ts
│       │   ├── planService.ts
│       │   └── rateLimitService.ts
│       ├── utils/          # Short code generation, API key utils
│       └── migration/
│           └── 001_tables.sql   # Full schema
└── frontend/
    └── src/
        ├── components/     # Navbar, RollingNumber (odometer)
        ├── context/        # AuthContext (JWT storage + refresh)
        ├── lib/            # apiClient — typed fetch wrapper with ApiError
        └── pages/          # Landing, Login, Signup, Dashboard, Analytics
```

---

## Local Setup

**Prerequisites:** Node.js 20+, PostgreSQL, Redis

```bash
git clone https://github.com/0x1zen/easyurl.in.git
cd easyurl.in
```

**Backend**

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Required backend variables (`backend/.env`):

| Variable | Example |
|---|---|
| `PORT` | `3000` |
| `NODE_ENV` | `development` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `url_shortener` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `your_db_password` |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | _(blank if no auth)_ |
| `JWT_SECRET` | _(long random string)_ |
| `APP_BASE_URL` | `http://localhost:3000` |
| `ADMIN_SECRET` | _(secret value)_ |
| `GOOGLE_SAFE_BROWSING_API_KEY` | _(leave blank to disable)_ |

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Required frontend variable (`frontend/.env`):

| Variable | Example |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` |

Backend runs on `:3000`, frontend dev server on `:5173`.

**Database**

```bash
psql -U postgres -d your_db -f backend/src/migration/001_tables.sql
```

---

## Known Limitations / Future Work

- **Click durability:** fire-and-forget write loses clicks on crash. A BullMQ queue with Redis persistence would close this gap.
- **No email verification:** accounts are active immediately on signup.
- **No payment integration:** plan upgrades are manual. Razorpay is the natural next step for the Indian market.
- **Bot traffic:** the stats endpoint counts all requests; there is no deduplication of crawler or bot clicks.
- **Single-server:** the current deployment is a single Oracle Cloud ARM64 VM. Read replicas or a managed DB would be the first scaling step.

---

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/shorten/anonymous` | None | Create anonymous short URL (24h TTL) |
| `POST` | `/shorten` | JWT | Create permanent short URL |
| `GET` | `/:code` | None | Redirect (cache-aside) |
| `GET` | `/urls` | JWT | List authenticated user's links |
| `PATCH` | `/urls/:id` | JWT | Edit destination / alias / reactivate |
| `DELETE` | `/urls/:id` | JWT | Soft-delete link |
| `GET` | `/urls/:id/analytics` | JWT | Click analytics for a link |
| `GET` | `/stats` | None | Public aggregate stats (Redis cached) |

---

## License

MIT
