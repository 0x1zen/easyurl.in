import { useState, useEffect, type FormEvent } from "react";
import { Link, Outlet, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";
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

function Landing() {
  const { hash } = useLocation();
  const [shortenUrl, setShortenUrl] = useState("");
  const [shortenResult, setShortenResult] = useState<ShortenResult | null>(null);
  const [shortenLoading, setShortenLoading] = useState(false);
  const [shortenError, setShortenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    try {
      new URL(shortenUrl);
    } catch {
      setShortenError("Please enter a valid URL");
      return;
    }
    setShortenLoading(true);
    apiRequest<AnonymousShortenResponse>("/shorten/anonymous", {
      method: "POST",
      body: { originalUrl: shortenUrl },
    })
      .then((data) => {
        setShortenResult({
          shortUrl: data.shortUrl,
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

          {shortenResult !== null && (
            <div className="card shorten-result-card">
              <div className="shorten-result-url-row">
                <a
                  href={shortenResult.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shorten-result-link"
                >
                  {shortenResult.shortUrl}
                </a>
                <button
                  type="button"
                  className="shorten-result-copy-btn"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="shorten-result-expiry">
                ⚠ This link expires in 24 hours
              </p>
              <Link to="/signup" className="shorten-result-cta">
                Sign up for permanent links and analytics →
              </Link>
            </div>
          )}

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
