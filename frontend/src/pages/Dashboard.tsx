import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/apiClient";

const SHORT_BASE = import.meta.env.VITE_API_BASE_URL as string;

function displayUrl(shortCode: string): string {
  return `${SHORT_BASE.replace(/^https?:\/\//, "")}/${shortCode}`;
}

interface UrlRow {
  id: number;
  original_url: string;
  short_code: string;
  is_active: boolean;
  is_custom_alias: boolean;
  created_at: string;
  expiry_date: string | null;
  moderation_status: string;
  click_count: number;
}

interface ShortenResponse {
  shortUrl: string;
  originalUrl: string;
  shortCode: string;
  createdAt: string;
}

type EditMode = "destination" | "alias";

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1.5 6 4.5 9 10.5 3" />
    </svg>
  );
}

function IconPauseBars() {
  return (
    <svg width={10} height={10} viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
      <rect x="2" y="2" width="3" height="8" rx="0.8" />
      <rect x="7" y="2" width="3" height="8" rx="0.8" />
    </svg>
  );
}

function IconXMark() {
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M2 2l8 8M10 2L2 10" />
    </svg>
  );
}


function IconClipboard() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function IconBarChart() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <rect x="3" y="12" width="5" height="9" rx="1" />
      <rect x="10" y="7" width="5" height="14" rx="1" />
      <rect x="17" y="3" width="5" height="18" rx="1" />
    </svg>
  );
}

function IconDotsV() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconHamburger() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
}

// ── FaviconTile ───────────────────────────────────────────────────────────────

const FAVICON_COLORS = [
  "#4f86f7", "#e8556b", "#f5a623", "#2db67d", "#9b51e0", "#0ea5e9",
];

function faviconColor(host: string): string {
  const bare = host.replace(/^www\./, "");
  const sum = bare.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return FAVICON_COLORS[sum % FAVICON_COLORS.length];
}

function FaviconTile({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* invalid URL — show letter fallback */
  }

  const bare = host.replace(/^www\./, "");
  const letter = bare.charAt(0).toUpperCase() || "?";

  return (
    <div className="favicon-tile">
      {!failed && host.length > 0 ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          width={22}
          height={22}
          alt=""
          onError={() => setFailed(true)}
          style={{ borderRadius: 3 }}
        />
      ) : (
        <span
          className="favicon-letter"
          style={{ background: faviconColor(host) }}
          aria-hidden="true"
        >
          {letter}
        </span>
      )}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ url }: { url: UrlRow }) {
  if (url.moderation_status === "blocked") {
    return (
      <span className="status-pill status-pill--blocked">
        <span className="status-pill-icon" aria-hidden="true"><IconXMark /></span>
        Blocked
      </span>
    );
  }
  if (url.is_active) {
    return (
      <span className="status-pill status-pill--active">
        <span className="status-pill-icon" aria-hidden="true"><IconCheck /></span>
        Active
      </span>
    );
  }
  return (
    <span className="status-pill status-pill--paused">
      <span className="status-pill-icon" aria-hidden="true"><IconPauseBars /></span>
      Paused
    </span>
  );
}

// ── LinkRow ───────────────────────────────────────────────────────────────────

interface LinkRowProps {
  url: UrlRow;
  token: string | null;
  onUpdate: (updated: UrlRow) => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}

function LinkRow({
  url,
  token,
  onUpdate,
  isMenuOpen,
  onMenuToggle,
  onMenuClose,
}: LinkRowProps) {
  const [rowLoading, setRowLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const isConfirmed = url.id > 0;
  const fullShortUrl = `${SHORT_BASE}/${url.short_code}`;

  let destHost = url.original_url;
  try {
    destHost = new URL(url.original_url).hostname;
  } catch {
    /* keep full string if URL parse fails */
  }

  function handleCopy(): void {
    navigator.clipboard
      .writeText(fullShortUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function startEdit(mode: EditMode): void {
    setConfirmDeactivate(false);
    setEditMode(mode);
    setEditValue(mode === "destination" ? url.original_url : url.short_code);
    setEditError(null);
    onMenuClose();
  }

  function cancelEdit(): void {
    setEditMode(null);
    setEditValue("");
    setEditError(null);
  }

  function handleSaveEdit(): void {
    if (!token || !isConfirmed || editMode === null) return;
    const mode = editMode;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setEditLoading(true);
    setEditError(null);
    const body =
      mode === "destination"
        ? { originalUrl: trimmed }
        : { newAlias: trimmed };
    apiRequest<UrlRow>(`/urls/${url.id}`, { method: "PATCH", token, body })
      .then((updated) => {
        onUpdate(updated);
        setEditMode(null);
        setEditValue("");
      })
      .catch((err: unknown) => {
        if (mode === "alias" && err instanceof ApiError && err.status === 409) {
          setEditError("This alias is already taken");
        } else {
          setEditError(err instanceof Error ? err.message : "Failed to save");
        }
      })
      .finally(() => setEditLoading(false));
  }

  function handleDeactivate(): void {
    if (!token || !isConfirmed) return;
    setRowLoading(true);
    setRowError(null);
    setConfirmDeactivate(false);
    apiRequest<{ message: string }>(`/urls/${url.id}`, { method: "DELETE", token })
      .then(() => onUpdate({ ...url, is_active: false }))
      .catch((err: unknown) => {
        setRowError(err instanceof Error ? err.message : "Failed to deactivate");
      })
      .finally(() => setRowLoading(false));
  }

  function handleReactivate(): void {
    if (!token || !isConfirmed) return;
    setRowLoading(true);
    setRowError(null);
    apiRequest<UrlRow>(`/urls/${url.id}`, {
      method: "PATCH",
      token,
      body: { reactivate: true },
    })
      .then((updated) => onUpdate(updated))
      .catch((err: unknown) => {
        setRowError(err instanceof Error ? err.message : "Failed to reactivate");
      })
      .finally(() => setRowLoading(false));
  }

  return (
    <div className="link-row">
      <div className="link-row-grid">
        {/* Link column — favicon tile + short link + hostname */}
        <div className="link-col-link">
          <FaviconTile url={url.original_url} />
          <div className="link-col-link-text">
            <div className="link-short-row">
              <a
                href={fullShortUrl}
                target="_blank"
                rel="noreferrer"
                className="link-short-text"
              >
                {displayUrl(url.short_code)}
              </a>
              <button type="button" className="copy-btn" onClick={handleCopy}>
                <IconClipboard />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="link-dest" title={url.original_url}>
              {destHost}
            </p>
          </div>
        </div>

        <div className="link-col-clicks">
          {url.click_count.toLocaleString()}
        </div>

        {/* Status */}
        <div className="link-col-status">
          <StatusBadge url={url} />
        </div>

        {/* Actions */}
        <div className="link-col-actions">
          {isConfirmed ? (
            <Link
              to={`/urls/${url.id}/analytics`}
              className="row-analytics-btn"
            >
              <span className="row-analytics-icon" aria-hidden="true">
                <IconBarChart />
              </span>
              Analytics
            </Link>
          ) : (
            <span className="row-analytics-btn row-analytics-btn--pending">
              <span className="row-analytics-icon" aria-hidden="true">
                <IconBarChart />
              </span>
              Analytics
            </span>
          )}

          <div className="overflow-menu-wrap">
            <button
              type="button"
              className="row-overflow-btn"
              aria-label="More actions"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              disabled={rowLoading || !isConfirmed}
              onClick={(e) => {
                setButtonRect(e.currentTarget.getBoundingClientRect());
                e.stopPropagation();
                onMenuToggle();
              }}
            >
              <IconDotsV />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile card (hidden on desktop via CSS) ── */}
      <div className="link-card-mobile">
        <div className="link-card-top">
          <FaviconTile url={url.original_url} />
          <div className="link-card-text">
            <a
              href={fullShortUrl}
              target="_blank"
              rel="noreferrer"
              className="link-short-text"
            >
              {displayUrl(url.short_code)}
            </a>
            <p className="link-dest" title={url.original_url}>{destHost}</p>
          </div>
          <div className="link-card-status">
            <StatusBadge url={url} />
          </div>
        </div>

        <div className="link-card-clicks">
          <span className="link-card-clicks-icon" aria-hidden="true"><IconBarChart /></span>
          <strong className="link-card-clicks-count">{url.click_count.toLocaleString()}</strong>
          <span className="link-card-clicks-label">clicks</span>
        </div>

        <div className="link-card-actions">
          <button type="button" className="link-card-btn" onClick={handleCopy}>
            <IconClipboard />
            {copied ? "Copied!" : "Copy"}
          </button>
          {isConfirmed ? (
            <Link
              to={`/urls/${url.id}/analytics`}
              className="link-card-btn link-card-btn--analytics"
            >
              <IconBarChart />
              Analytics
            </Link>
          ) : (
            <span className="link-card-btn link-card-btn--analytics link-card-btn--disabled">
              <IconBarChart />
              Analytics
            </span>
          )}
          <button
            type="button"
            className="link-card-overflow-btn"
            aria-label="More actions"
            disabled={rowLoading || !isConfirmed}
            onClick={(e) => {
              setButtonRect(e.currentTarget.getBoundingClientRect());
              e.stopPropagation();
              onMenuToggle();
            }}
          >
            <IconDotsV />
          </button>
        </div>
      </div>

      {/* Overflow menu popup — shared between desktop + mobile triggers */}
      {isMenuOpen && buttonRect !== null && (
        <div
          className="overflow-menu"
          role="menu"
          style={{
            top: buttonRect.bottom + 4,
            right: Math.max(8, window.innerWidth - buttonRect.right),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {url.is_active ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item"
                disabled={rowLoading}
                onClick={() => startEdit("destination")}
              >
                Edit destination
              </button>
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item"
                disabled={rowLoading}
                onClick={() => startEdit("alias")}
              >
                Rename alias
              </button>
              <div className="overflow-menu-divider" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item overflow-menu-item--danger"
                disabled={rowLoading}
                onClick={() => {
                  setEditMode(null);
                  setConfirmDeactivate(true);
                  onMenuClose();
                }}
              >
                Deactivate link
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item"
                disabled={rowLoading}
                onClick={() => {
                  handleReactivate();
                  onMenuClose();
                }}
              >
                Reactivate
              </button>
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item"
                disabled={rowLoading}
                onClick={() => startEdit("destination")}
              >
                Edit destination
              </button>
              <button
                type="button"
                role="menuitem"
                className="overflow-menu-item"
                disabled={rowLoading}
                onClick={() => startEdit("alias")}
              >
                Rename alias
              </button>
            </>
          )}
        </div>
      )}

      {/* Deactivation confirmation */}
      {confirmDeactivate && (
        <div className="link-row-inline">
          <p className="link-row-inline-text">
            Deactivate this link? Visitors will get a 410 error until you reactivate it.
          </p>
          <div className="link-row-edit-row">
            <button
              type="button"
              className="btn btn-danger link-row-action-btn"
              disabled={rowLoading}
              onClick={handleDeactivate}
            >
              {rowLoading ? "Deactivating…" : "Yes, deactivate"}
            </button>
            <button
              type="button"
              className="link-row-cancel-btn"
              onClick={() => setConfirmDeactivate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline edit form */}
      {editMode !== null && (
        <div className="link-row-inline">
          <p className="link-row-inline-text">
            {editMode === "destination" ? "New destination URL" : "New alias"}
          </p>
          {editError !== null && <p className="form-error">{editError}</p>}
          <div className="link-row-edit-row">
            <input
              type={editMode === "destination" ? "url" : "text"}
              className="input link-row-edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={
                editMode === "destination" ? "https://…" : "my-custom-slug"
              }
              autoFocus
            />
            <button
              type="button"
              className="btn link-row-action-btn"
              disabled={editLoading || editValue.trim().length === 0}
              onClick={handleSaveEdit}
            >
              {editLoading ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="link-row-cancel-btn"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rowError !== null && (
        <p className="link-row-error">{rowError}</p>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const FREE_PLAN_LIMIT = 5;

export default function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [urls, setUrls] = useState<UrlRow[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [destUrl, setDestUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentToken = token;
    if (!currentToken) return;
    apiRequest<UrlRow[]>("/urls", { token: currentToken })
      .then(setUrls)
      .catch((err: unknown) => {
        setFetchError(
          err instanceof Error ? err.message : "Failed to load links"
        );
      })
      .finally(() => setLoadingUrls(false));
  }, [token]);

  useEffect(() => {
    if (openMenuId === null) return;
    function handleDocClick() {
      setOpenMenuId(null);
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, [openMenuId]);

  function handleLogout(): void {
    logout();
    void navigate("/");
  }

  function closeForm(): void {
    setFormOpen(false);
    setDestUrl("");
    setAlias("");
    setFormError(null);
  }

  function handleCreateLink(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const currentToken = token;
    if (!currentToken) return;
    setFormLoading(true);
    setFormError(null);

    const body: { originalUrl: string; customAlias?: string } = {
      originalUrl: destUrl,
    };
    if (alias.trim()) {
      body.customAlias = alias.trim();
    }

    apiRequest<ShortenResponse>("/shorten", {
      method: "POST",
      token: currentToken,
      body,
    })
      .then((data) => {
        const placeholder: UrlRow = {
          id: 0,
          original_url: data.originalUrl,
          short_code: data.shortCode,
          is_active: true,
          is_custom_alias: alias.trim().length > 0,
          created_at: data.createdAt,
          expiry_date: null,
          moderation_status: "approved",
          click_count: 0,
        };
        setUrls((prev) => [placeholder, ...prev]);
        closeForm();
        apiRequest<UrlRow[]>("/urls", { token: currentToken })
          .then(setUrls)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          setFormError("This alias is already taken");
        } else if (err instanceof ApiError && err.status === 400) {
          setFormError(err.message);
        } else {
          setFormError(err instanceof Error ? err.message : "Something went wrong");
        }
      })
      .finally(() => setFormLoading(false));
  }

  function handleUpdateUrl(updated: UrlRow): void {
    setUrls((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  return (
    <div className="dash-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <Link to="/" className="navbar-brand">
            <img src="https://res.cloudinary.com/dwokx2ugh/image/upload/v1783216133/favicon-48_zot5eo.png" width={28} height={28} alt="" className="navbar-logo-mark" />
            <span className="navbar-wordmark">
              easyurl<span className="navbar-tld">.in</span>
            </span>
          </Link>

          <div className="dash-header-right">
            {/* Desktop: badge + divider + avatar + logout */}
            <span className="dash-plan-badge">Free plan</span>
            <span className="dash-header-sep" aria-hidden="true" />
            <span className="dash-avatar" aria-label="Account">A</span>
            <button
              type="button"
              className="dash-logout-btn"
              onClick={handleLogout}
            >
              Log out
            </button>
            {/* Mobile: hamburger toggle */}
            <button
              type="button"
              className="dash-hamburger-btn"
              aria-label="Open menu"
              onClick={(e) => {
                e.stopPropagation();
                setMobileMenuOpen((o) => !o);
              }}
            >
              <IconHamburger />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div
            className="dash-mobile-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="dash-plan-badge">Free plan</span>
            <button
              type="button"
              className="dash-logout-btn"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
      </header>

      {/* Body */}
      <main className="dash-body">
        {/* Page-level header row */}
        <div className="dash-page-header">
          <div className="dash-heading-group">
            <h1 className="dash-heading">My Links</h1>
            {/* Mobile-only plan pill next to heading */}
            <span className="dash-mobile-plan-pill">Free plan</span>
          </div>
          {/* Mobile-only subtitle */}
          {!loadingUrls && (
            <p className="dash-links-subtitle">
              {urls.length} of {FREE_PLAN_LIMIT} link{urls.length !== 1 ? "s" : ""} used
            </p>
          )}
          <button
            type="button"
            className="btn dash-new-link-btn"
            onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
          >
            {formOpen ? (
              "Cancel"
            ) : (
              <>
                <IconPlus />
                New Link
              </>
            )}
          </button>
        </div>

        {/* Create link form */}
        {formOpen && (
          <div className="card create-form">
            {formError !== null && (
              <p className="form-error">{formError}</p>
            )}
            <form onSubmit={handleCreateLink}>
              <div className="form-group">
                <label htmlFor="dest-url">Destination URL</label>
                <input
                  id="dest-url"
                  type="url"
                  className="input"
                  value={destUrl}
                  onChange={(e) => setDestUrl(e.target.value)}
                  placeholder="https://example.com/very/long/path"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="alias">
                  Custom Alias{" "}
                  <span className="create-alias-hint">(optional)</span>
                </label>
                <input
                  id="alias"
                  type="text"
                  className="input"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="my-custom-slug"
                />
              </div>

              <button
                type="submit"
                className="btn create-submit-btn"
                disabled={formLoading}
              >
                {formLoading ? "Shortening…" : "Shorten it →"}
              </button>
            </form>
          </div>
        )}

        {/* Link list */}
        {loadingUrls ? (
          <p className="dash-status-text">Loading your links…</p>
        ) : fetchError !== null ? (
          <p className="form-error dash-status-text">{fetchError}</p>
        ) : urls.length === 0 ? (
          <div className="dash-empty">
            <p>No links yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="links-card">
            <div className="links-col-header">
              <span>Link</span>
              <span>Clicks</span>
              <span>Status</span>
              <span />
            </div>
            <div className="links-body">
              {urls.map((url) => (
                <LinkRow
                  key={url.short_code}
                  url={url}
                  token={token}
                  onUpdate={handleUpdateUrl}
                  isMenuOpen={openMenuId === url.id}
                  onMenuToggle={() =>
                    setOpenMenuId((prev) => (prev === url.id ? null : url.id))
                  }
                  onMenuClose={() => setOpenMenuId(null)}
                />
              ))}
            </div>
          </div>
        )}

        {!loadingUrls && (
          <p className="dash-upsell">
            Need more links? Contact us at rajdubalwork@gmail.com
          </p>
        )}
      </main>
    </div>
  );
}
