import { useState, useEffect, type FormEvent } from "react";
import { Link, Outlet, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import RollingNumber from "./components/RollingNumber";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import { useAuth } from "./context/AuthContext";
import { apiRequest } from "./lib/apiClient";

interface StatsResponse {
  totalUrls: number;
  totalClicks: number;
}

// ── Landing page data ────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "Instant Link Shortening",
    desc: "Create short links in seconds, no account required for quick links.",
  },
  {
    title: "Custom Aliases",
    desc: "Choose your own short code (e.g. easyurl.in/my-brand) for branded links.",
  },
  {
    title: "Deep Click Analytics",
    desc: "Track clicks by country, device, browser, OS, and time of day.",
  },
  {
    title: "Link Management",
    desc: "Edit destinations, delete links, and organise everything from your dashboard.",
  },
  {
    title: "Malicious URL Protection",
    desc: "Every link is checked against Google Safe Browsing before creation — unsafe links never go live.",
  },
  {
    title: "Anonymous Quick Links",
    desc: "No account needed. Paste a URL, get a link instantly. Expires in 24 hours.",
  },
] as const;

// Returns scroll-reveal animation props. When `noMotion` is true (prefers-reduced-motion
// is active) we return an empty object so the element appears instantly — an accessibility
// consideration for users who experience discomfort or vestibular issues from on-screen movement.
function scrollAnim(
  delay: number,
  noMotion: boolean
): Pick<MotionProps, "initial" | "whileInView" | "transition" | "viewport"> {
  if (noMotion) return {};
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: "easeOut" },
    viewport: { once: true },
  };
}

interface ShortenResult {
  shortUrl: string;
  originalUrl: string;
  expiresAt: string;
  message: string;
}

interface AnonymousShortenResponse {
  shortUrl: string;
  shortCode: string;
  originalUrl: string;
  expiresAt: string;
  message: string;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return "https://" + trimmed;
}

function Landing() {
  const { hash } = useLocation();
  const [shortenUrl, setShortenUrl] = useState("");
  const [shortenResult, setShortenResult] = useState<ShortenResult | null>(null);
  const [shortenLoading, setShortenLoading] = useState(false);
  const [shortenError, setShortenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [stats, setStats] = useState({ linksCreated: 0, clicksTracked: 0 });

  useEffect(() => {
    apiRequest<StatsResponse>("/stats")
      .then((data) => {
        setStats({ linksCreated: data.totalUrls, clicksTracked: data.totalClicks });
      })
      .catch(() => {
        // Stats are decorative — silently keep zeros on failure
      });
  }, []);

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  const prefersReduced = useReducedMotion();
  const noMotion = prefersReduced === true;
  const hoverLift: MotionProps["whileHover"] = noMotion
    ? undefined
    : { y: -4, transition: { type: "tween", duration: 0.15 } };

  function handleShorten(): void {
    setShortenError(null);
    setShowQr(false);
    const normalized = normalizeUrl(shortenUrl);
    try {
      new URL(normalized);
    } catch {
      setShortenError("Please enter a valid URL");
      return;
    }
    setShortenLoading(true);
    apiRequest<AnonymousShortenResponse>("/shorten/anonymous", {
      method: "POST",
      body: { originalUrl: normalized },
    })
      .then((data) => {
        setShortenResult({
          shortUrl: data.shortUrl,
          originalUrl: data.originalUrl,
          expiresAt: data.expiresAt,
          message: data.message,
        });
        setShortenError(null);
      })
      .catch((err: unknown) => {
        setShortenError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setShortenLoading(false));
  }

  function handleCopy(): void {
    if (!shortenResult) return;
    navigator.clipboard
      .writeText(shortenResult.shortUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function handleShare(): void {
    if (!shortenResult) return;
    if (navigator.share) {
      navigator.share({ url: shortenResult.shortUrl }).catch(() => {});
    } else {
      handleCopy();
    }
  }

  return (
    <>
      {/* ── Hero ── */}
      <div className="landing">
        <div className="landing-content">
          <h1 className="landing-headline">
            Shorten links.<br />Track what matters.
          </h1>
          <p className="landing-subtext">
            Create short, branded links in seconds and see exactly where your clicks come from.
          </p>

          <div className="shorten-bar">
            <input
              type="url"
              placeholder="Paste a long URL…"
              value={shortenUrl}
              onChange={(e) => setShortenUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleShorten(); }}
            />
            <button type="button" onClick={handleShorten} disabled={shortenLoading}>
              {shortenLoading ? "Shortening…" : "Shorten"}
            </button>
          </div>

          {shortenError !== null && (
            <p className="shorten-bar-error">{shortenError}</p>
          )}

          {shortenResult !== null && (() => {
            let destHost = shortenResult.originalUrl;
            try { destHost = new URL(shortenResult.originalUrl).hostname; } catch { /* keep */ }
            return (
              <motion.div
                className="sr-card"
                initial={noMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {/* Success header */}
                <div className="sr-header">
                  <span className="sr-check" aria-hidden="true">
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3.5 3.5L13 4.5" stroke="#177049" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="sr-header-text">Your short link is ready</span>
                </div>

                {/* Body */}
                <div className="sr-body">
                  <div className="sr-left">
                    <p className="sr-label">SHORT LINK</p>
                    <div className="sr-link-row">
                      <a
                        href={shortenResult.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="sr-link"
                      >
                        {shortenResult.shortUrl}
                      </a>
                      <button type="button" className="btn sr-copy-btn" onClick={handleCopy}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                    </div>
                    <div className="sr-destination">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${destHost}&sz=32`}
                        width={14} height={14} alt="" aria-hidden="true"
                      />
                      <span>redirects to {destHost}</span>
                    </div>
                    <div className="sr-actions">
                      <a href={shortenResult.shortUrl} target="_blank" rel="noreferrer" className="sr-action-btn">
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Visit
                      </a>
                      <button type="button" className="sr-action-btn" onClick={handleShare}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        Share
                      </button>
                    </div>
                  </div>

                  <div className="sr-qr">
                    {showQr ? (
                      <>
                        <div className="sr-qr-tile">
                          <QRCodeSVG value={shortenResult.shortUrl} size={112} />
                        </div>
                        <span className="sr-qr-caption">Scan QR</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="sr-qr-toggle"
                        onClick={() => setShowQr(true)}
                      >
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="4" height="4" rx="0.5" />
                        </svg>
                        Show QR
                      </button>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="sr-footer">
                  <span className="sr-expiry-pill">⏱ Expires in 24 hours</span>
                  <Link to="/signup" className="sr-cta">
                    Sign up for permanent links + analytics →
                  </Link>
                </div>
              </motion.div>
            );
          })()}

          <div className="trust-strip">
            <div className="stats-card">
              <div className="trust-item">
                <RollingNumber target={stats.linksCreated} suffix="+" />
                <span className="trust-label">Links Created</span>
              </div>
              <div className="trust-item">
                <RollingNumber target={stats.clicksTracked} suffix="+" />
                <span className="trust-label">Clicks Tracked</span>
              </div>
              <div className="trust-item">
                <RollingNumber target={99.9} decimals={1} suffix="%" />
                <span className="trust-label">Uptime</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feature grid ── */}
      <section id="features" className="lp-section lp-section--surface">
        <div className="lp-section-inner">
          <h2 className="lp-section-heading">Built for serious link management</h2>
          <p className="lp-section-subtext">Everything you need — nothing you don't.</p>
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="card feature-card"
                {...scrollAnim(i * 0.07, noMotion)}
                whileHover={hoverLift}
              >
                <h3 className="feature-card-title">{f.title}</h3>
                <p className="feature-card-desc">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="lp-cta">
        <div className="lp-section-inner">
          <h2 className="lp-section-heading">Start shortening for free</h2>
          <p className="lp-cta-subtext">
            No credit card. No trial. Just sign up and start.
          </p>
          <Link to="/signup" className="btn lp-cta-btn">Create free account</Link>
        </div>
      </section>
    </>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    apiRequest<{ token: string }>("/login", {
      method: "POST",
      body: { email, password },
    })
      .then((data) => {
        login(data.token);
        navigate("/dashboard");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Welcome back</h1>
        <span className="text-muted">Sign in to your account</span>

        {error !== null && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}


function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/urls/:id/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
