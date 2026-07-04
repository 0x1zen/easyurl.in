import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";

// Short URLs are served from the same origin as the API in this setup.
// In production this would be a separate domain/CDN.
const SHORT_BASE = import.meta.env.VITE_API_BASE_URL as string;

// Strip protocol so we display "localhost:3000/abc" instead of "http://localhost:3000/abc".
// In production this becomes "easyurl.in/abc".
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
}

interface ShortenResponse {
  shortUrl: string;
  originalUrl: string;
  shortCode: string;
  createdAt: string;
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ url }: { url: UrlRow }) {
  if (url.moderation_status === "blocked") {
    return (
      <span className="status-pill status-pill--blocked">
        <span className="status-dot" aria-hidden="true" />
        Blocked
      </span>
    );
  }
  if (url.is_active) {
    return (
      <span className="status-pill status-pill--active">
        <span className="status-dot" aria-hidden="true" />
        Active
      </span>
    );
  }
  return (
    <span className="status-pill status-pill--paused">
      <span className="status-dot" aria-hidden="true" />
      Paused
    </span>
  );
}

// ── LinkRow ──────────────────────────────────────────────────────────────────

interface LinkRowProps {
  url: UrlRow;
  isPro: boolean;
  token: string | null;
  onDelete: (id: number) => void;
  onUpdate: (updated: UrlRow) => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}

function LinkRow({
  url,
  isPro,
  token,
  onDelete,
  onUpdate,
  isMenuOpen,
  onMenuToggle,
  onMenuClose,
}: LinkRowProps) {
  const [rowLoading, setRowLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

  // id === 0 is a sentinel for optimistically-added rows whose real id is pending
  // a background sync — analytics link and overflow menu are disabled until resolved.
  const isConfirmed = url.id > 0;
  const fullShortUrl = `${SHORT_BASE}/${url.short_code}`;

  function handleCopy(): void {
    navigator.clipboard
      .writeText(fullShortUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function handleDeactivate(): void {
    if (!token || !isConfirmed) return;
    setRowLoading(true);
    setRowError(null);
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

  function handleDelete(): void {
    if (!token || !isConfirmed) return;
    setRowLoading(true);
    setRowError(null);
    apiRequest<{ message: string }>(`/urls/${url.id}`, { method: "DELETE", token })
      .then(() => onDelete(url.id))
      .catch((err: unknown) => {
        setRowError(err instanceof Error ? err.message : "Failed to delete");
      })
      .finally(() => setRowLoading(false));
  }

  return (
    <div className="link-row">
      <div className="link-row-grid">
        {/* Link column */}
        <div className="link-col-link">
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
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="link-dest" title={url.original_url}>
            {url.original_url}
          </p>
        </div>

        {/* Clicks — not yet aggregated in UrlRow; populates once analytics endpoint exposes it */}
        <div className="link-col-clicks">—</div>

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
              Analytics
            </Link>
          ) : (
            <span className="row-analytics-btn row-analytics-btn--pending">
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
              ⋯
            </button>

            {isMenuOpen && buttonRect !== null && (
              <div
                className="overflow-menu"
                role="menu"
                style={{
                  top: buttonRect.bottom + 4,
                  right: window.innerWidth - buttonRect.right,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {url.is_active ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="overflow-menu-item"
                    disabled={!isPro || rowLoading}
                    onClick={() => { handleDeactivate(); onMenuClose(); }}
                  >
                    Deactivate
                    {!isPro && <span className="overflow-menu-lock">🔒 Pro</span>}
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="overflow-menu-item"
                    disabled={!isPro || rowLoading}
                    onClick={() => { handleReactivate(); onMenuClose(); }}
                  >
                    Reactivate
                    {!isPro && <span className="overflow-menu-lock">🔒 Pro</span>}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="overflow-menu-item overflow-menu-item--danger"
                  disabled={!isPro || rowLoading}
                  onClick={() => { handleDelete(); onMenuClose(); }}
                >
                  Delete
                  {!isPro && <span className="overflow-menu-lock">🔒 Pro</span>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {rowError !== null && (
        <p className="link-row-error">{rowError}</p>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

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

  // null = no menu open; any other value = the id of the row whose menu is open
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // TODO: replace with data from a /me endpoint when available.
  // Currently derived from whether any existing link used a custom alias (a Pro-only feature).
  // Risk: a Pro user with no custom-alias links yet will see Free-plan UI until they create one.
  const isPro = urls.some((u) => u.is_custom_alias);
  const activeCount = urls.filter((u) => u.is_active).length;

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

  // Close any open overflow menu when the user clicks anywhere outside it.
  // stopPropagation on the ⋯ button and dropdown prevents those clicks from reaching here.
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
    if (isPro && alias.trim()) {
      body.customAlias = alias.trim();
    }

    apiRequest<ShortenResponse>("/shorten", {
      method: "POST",
      token: currentToken,
      body,
    })
      .then((data) => {
        // POST /shorten returns only { shortUrl, shortCode, originalUrl, createdAt }
        // — not the full UrlRow (missing id, moderation_status, etc.). We prepend a
        // placeholder (id=0) for instant UI feedback, then sync in the background to
        // replace it with the real row including the server-assigned id.
        const placeholder: UrlRow = {
          id: 0,
          original_url: data.originalUrl,
          short_code: data.shortCode,
          is_active: true,
          is_custom_alias: isPro && alias.trim().length > 0,
          created_at: data.createdAt,
          expiry_date: null,
          moderation_status: "approved",
        };
        setUrls((prev) => [placeholder, ...prev]);
        closeForm();
        // Background sync — replaces placeholder with real row once id is available
        apiRequest<UrlRow[]>("/urls", { token: currentToken })
          .then(setUrls)
          .catch(() => {});
      })
      .catch((err: unknown) => {
        setFormError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      })
      .finally(() => setFormLoading(false));
  }

  function handleDeleteUrl(id: number): void {
    setUrls((prev) => prev.filter((u) => u.id !== id));
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
            <span className="navbar-logo-mark" aria-hidden="true">e</span>
            <span className="navbar-wordmark">
              easyurl<span className="navbar-tld">.in</span>
            </span>
          </Link>

          <div className="dash-header-right">
            <span className="dash-plan-badge">
              {isPro ? "Pro plan" : "Free plan"}
            </span>
            <span className="dash-header-sep" aria-hidden="true" />
            <span className="dash-avatar" aria-label="Account">A</span>
            <button
              type="button"
              className="dash-logout-btn"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="dash-body">
        {/* Page-level header row */}
        <div className="dash-page-header">
          <div>
            <h1 className="dash-heading">My Links</h1>
            {!isPro && (
              <p className="dash-subtitle">
                {activeCount} of 5 links used on the Free plan
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn dash-new-link-btn"
            onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
          >
            {formOpen ? "Cancel" : "+ New Link"}
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
                  Custom Alias
                  {!isPro && (
                    <span className="create-alias-lock"> 🔒 Pro only</span>
                  )}
                </label>
                <input
                  id="alias"
                  type="text"
                  className="input"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  disabled={!isPro}
                  placeholder={
                    isPro
                      ? "my-custom-slug"
                      : "Upgrade to Pro to use custom aliases"
                  }
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
                  isPro={isPro}
                  token={token}
                  onDelete={handleDeleteUrl}
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

        {/* Upsell (free users only, shown once links are loaded) */}
        {!isPro && !loadingUrls && (
          <p className="dash-upsell">
            Need more than 5 links or detailed analytics?{" "}
            <Link to="/#pricing" className="dash-upsell-link">
              Upgrade to Pro →
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
