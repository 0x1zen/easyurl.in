import { useState, useEffect, type FormEvent } from "react";
import { Link, Outlet, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import { useAuth } from "./context/AuthContext";
import { apiRequest } from "./lib/apiClient";

// ── Landing page data ────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "Custom Aliases",
    desc: "Brand your links with memorable slugs — ditch random characters and own every URL you share.",
  },
  {
    title: "Deep Analytics",
    desc: "Clicks broken down by country, city, device, browser, OS, language, and hour of day.",
  },
  {
    title: "Smart Link Management",
    desc: "Set expiry dates, edit destinations, rename aliases, and organise links from one dashboard.",
  },
  {
    title: "Malicious URL Protection",
    desc: "Every URL is screened against Google Safe Browsing before creation — unsafe links never go live.",
  },
  {
    title: "Lightning-Fast Redirects",
    desc: "Redis-backed caching resolves redirects in milliseconds, consistently, at any traffic level.",
  },
  {
    title: "Free Tier to Get Started",
    desc: "Five lifetime links and 7-day analytics at zero cost — no credit card, no hidden limits.",
  },
] as const;

const FREE_PLAN = [
  "5 active links (lifetime)",
  "7-day analytics retention",
  "Basic click breakdown",
  "1-month free trial included",
] as const;

const PRO_PLAN = [
  "250 links per month",
  "2-year analytics retention",
  "Unlimited custom aliases",
  "Geography, device & AI insights",
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

function Landing() {
  const { hash } = useLocation();

  // Scroll to the hash section after the component mounts or when the hash changes.
  // Needed because <Link to="/#pricing"> is a SPA navigation — the browser won't
  // auto-scroll the way a full-page load would.
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

  return (
    <>
      {/* ── Hero (unchanged) ── */}
      <div className="landing">
        <div className="landing-content">
          <h1 className="landing-headline">
            Shorten links.<br />Track what matters.
          </h1>
          <p className="landing-subtext">
            Create short, branded links in seconds and see exactly where your clicks come from.
          </p>

          <div className="shorten-bar">
            <input type="url" placeholder="Paste a long URL…" />
            <button type="button">Shorten</button>
          </div>

          <div className="trust-strip">
            <div className="stats-card">
              <div className="trust-item">
                <span className="trust-value">2.4M+</span>
                <span className="trust-label">Links Created</span>
              </div>
              <div className="trust-item">
                <span className="trust-value">18M+</span>
                <span className="trust-label">Clicks Tracked</span>
              </div>
              <div className="trust-item">
                <span className="trust-value">99.9%</span>
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

      {/* ── Pricing teaser ── */}
      <section id="pricing" className="lp-section">
        <div className="lp-section-inner">
          <h2 className="lp-section-heading">Simple, transparent pricing</h2>
          <p className="lp-section-subtext">Start free, upgrade when you're ready.</p>
          <div className="pricing-grid">
            <motion.div
              className="card pricing-card"
              {...scrollAnim(0, noMotion)}
              whileHover={hoverLift}
            >
              <p className="pricing-name">Free</p>
              <p className="pricing-price">₹0</p>
              <ul className="pricing-features">
                {FREE_PLAN.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link to="/signup" className="btn">Get started</Link>
            </motion.div>

            <motion.div
              className="card pricing-card pricing-card--pro"
              {...scrollAnim(0.1, noMotion)}
              whileHover={hoverLift}
            >
              <p className="pricing-name">
                Pro <span className="badge">Most popular</span>
              </p>
              <p className="pricing-price">
                ₹699<span className="pricing-period">/month</span>
              </p>
              <ul className="pricing-features">
                {PRO_PLAN.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link to="/signup" className="btn">Start free trial</Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="lp-cta">
        <div className="lp-section-inner">
          <h2 className="lp-section-heading">Ready to take control of your links?</h2>
          <p className="lp-cta-subtext">
            Join thousands of teams using easyurl.in to shorten, brand, and track every click.
          </p>
          <Link to="/signup" className="btn lp-cta-btn">Create your free account</Link>
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
