-- ============================
-- 1. PLANS
-- ============================
CREATE TABLE IF NOT EXISTS plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    price NUMERIC(10,2) NOT NULL,
    monthly_url_limit INT NOT NULL,
    analytics_retention_days INT NOT NULL,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- 2. SUBSCRIBERS
-- ============================
CREATE TABLE IF NOT EXISTS subscribers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    api_key VARCHAR(64) NOT NULL UNIQUE,
    plan_id BIGINT NOT NULL REFERENCES plans(id),
    trial_start_date DATE,
    trial_end_date DATE,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'cancelled')),
    signup_ip VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- 3. URLS
-- ============================
CREATE TABLE IF NOT EXISTS urls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    original_url TEXT NOT NULL,
    short_code VARCHAR(30) NOT NULL UNIQUE,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
    is_custom_alias BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved'
        CHECK (moderation_status IN ('pending', 'approved', 'blocked')),
    expiry_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- 4. TAGS
-- ============================
create TABLE IF NOT exists tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscriber_id, name)
);

-- ============================
-- 5. URL_TAGS (junction table)
-- ============================
create TABLE IF NOT EXISTS url_tags (
    url_id BIGINT NOT NULL REFERENCES urls(id),
    tag_id BIGINT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (url_id, tag_id)
);

-- ============================
-- 6. CLICKS
-- ============================
create TABLE IF NOT EXISTS clicks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url_id BIGINT NOT NULL REFERENCES urls(id),
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    country VARCHAR(100),
    city VARCHAR(100),
    device_type VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    referrer TEXT
);

-- ============================
-- 7. SUPPORT_TICKETS
-- ============================
create TABLE IF NOT EXISTS support_tickets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ============================
-- 8. MALICIOUS_URLS (audit log)
-- ============================
create TABLE IF NOT EXISTS malicious_urls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    original_url TEXT NOT NULL,
    source VARCHAR(30) NOT NULL
        CHECK (source IN ('google_safe_browsing', 'virustotal', 'user_report', 'manual_review')),
    threat_type VARCHAR(50),
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- 9. FLAGGED_DOMAINS (admin verdicts)
-- ============================
create TABLE IF NOT EXISTS flagged_domains (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'blocked')),
    escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT
);

-- This column genuinely exists from your original schema script — safe to rename
ALTER TABLE plans RENAME COLUMN monthly_url_limit TO active_url_limit;

-- Free plan currently has features = {} (the column default) — fill it in properly
UPDATE plans SET features = '{"custom_alias": false, "manage_links": false}'::jsonb
    WHERE name = 'Free';
