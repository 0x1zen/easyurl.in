
-- ==========================================
-- 1. PLANS
-- ==========================================
CREATE TABLE IF NOT EXISTS plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    price NUMERIC(10,2) NOT NULL,
    active_url_limit INT NOT NULL,
    analytics_retention_days INT NOT NULL,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, price, active_url_limit, analytics_retention_days, features)
VALUES ('Free', 0.00, 5, 36500, '{"custom_alias": true, "manage_links": true}'::jsonb);

-- ==========================================
-- 2. SUBSCRIBERS
-- ==========================================
CREATE TABLE IF NOT EXISTS subscribers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    plan_id BIGINT NOT NULL REFERENCES plans(id),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended')),
    signup_ip VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. URLS
-- ==========================================
CREATE TABLE IF NOT EXISTS urls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    original_url TEXT NOT NULL,
    short_code VARCHAR(30) NOT NULL UNIQUE,
    domain VARCHAR(255),
    -- Ownership: null for anonymous, set for account-owned
    account_id BIGINT REFERENCES subscribers(id),
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    -- Anonymous creator info (captured even for anonymous links)
    created_by_ip VARCHAR(45),
    created_by_browser VARCHAR(50),
    created_by_device VARCHAR(50),
    created_by_country VARCHAR(100),
    -- Custom alias flag (Pro only)
    is_custom_alias BOOLEAN NOT NULL DEFAULT FALSE,
    -- Moderation
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved'
        CHECK (moderation_status IN ('pending', 'approved', 'blocked')),
    -- Expiry: set for anonymous (24h), null for free accounts, managed for Pro
    expiry_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 4. CLICKS
-- ==========================================
CREATE TABLE IF NOT EXISTS clicks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url_id BIGINT NOT NULL REFERENCES urls(id),
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    country VARCHAR(100),
    city VARCHAR(100),
    device_type VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    referrer TEXT,
    language VARCHAR(35)
);

-- ==========================================
-- 5. ANONYMOUS URL CREATION LOG
-- ==========================================
CREATE TABLE IF NOT EXISTS anonymous_url_creation_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    short_code VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_anon_log_ip_created ON anonymous_url_creation_log(ip_address, created_at);

-- ==========================================
-- 6. MALICIOUS_URLS (audit log)
-- ==========================================
CREATE TABLE IF NOT EXISTS malicious_urls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    original_url TEXT NOT NULL,
    source VARCHAR(30) NOT NULL
        CHECK (source IN ('google_safe_browsing', 'virustotal', 'user_report', 'manual_review')),
    threat_type VARCHAR(50),
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 7. FLAGGED_DOMAINS (admin verdicts)
-- ==========================================
CREATE TABLE IF NOT EXISTS flagged_domains (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'blocked')),
    escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT
);

-- ==========================================
-- 8. SUPPORT TICKETS
-- ==========================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE table if not EXISTS url_destination_changes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url_id BIGINT NOT NULL REFERENCES urls(id),
    old_url TEXT NOT NULL,
    new_url TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dest_changes_url_id ON url_destination_changes(url_id);
