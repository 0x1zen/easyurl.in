import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";

type Step = "get-key" | "setup-account";

export default function Signup() {
  const [step, setStep] = useState<Step>("get-key");
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyGenerated, setApiKeyGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  function handleGenerateKey(): void {
    setLoading(true);
    setError(null);
    apiRequest<{ apiKey: string; trialEndDate: string }>("/trial-key", {
      method: "POST",
    })
      .then((data) => {
        setApiKey(data.apiKey);
        setApiKeyGenerated(true);
        setStep("setup-account");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        const isRateLimit =
          msg.toLowerCase().includes("too many") || msg.includes("status 429");
        setError(
          isRateLimit
            ? "You've reached the limit for new trial keys from this network. Please try again tomorrow."
            : msg
        );
      })
      .finally(() => setLoading(false));
  }

  function handleSkip(): void {
    setError(null);
    setStep("setup-account");
  }

  function handleBack(): void {
    setApiKey("");
    setApiKeyGenerated(false);
    setError(null);
    setStep("get-key");
  }

  function handleCopy(): void {
    navigator.clipboard
      .writeText(apiKey)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function handleSignup(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setLoading(true);
    setError(null);
    apiRequest<{ token: string }>("/signup", {
      method: "POST",
      apiKey,
      body: { email, password },
    })
      .then((data) => {
        login(data.token);
        void navigate("/dashboard");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
  }

  if (step === "get-key") {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1>Get started free</h1>
          <span className="text-muted">
            Get a free API key — no email required. You'll set up your account
            in the next step.
          </span>

          {error !== null && <p className="form-error">{error}</p>}

          <button
            type="button"
            className="btn"
            onClick={handleGenerateKey}
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate my free API key"}
          </button>

          <button
            type="button"
            className="signup-skip-link"
            onClick={handleSkip}
          >
            Already have an API key? Skip to account setup →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Set up your account</h1>
        <span className="text-muted">
          Connect an email and password to access your dashboard.
        </span>

        {error !== null && <p className="form-error">{error}</p>}

        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label htmlFor="apikey">API Key</label>
            <div className="apikey-field">
              <input
                id="apikey"
                type="text"
                className="input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                readOnly={apiKeyGenerated}
                placeholder="Paste your API key"
                required
              />
              {apiKeyGenerated && (
                <button
                  type="button"
                  className="apikey-copy-btn"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
            {apiKeyGenerated && (
              <span className="text-muted">
                Save this key somewhere safe — we won't show it again.
              </span>
            )}
          </div>

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
              autoComplete="new-password"
            />
            <span className="text-muted">Minimum 8 characters</span>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          {apiKeyGenerated ? (
            <button
              type="button"
              className="signup-back-btn"
              onClick={handleBack}
            >
              ← Back
            </button>
          ) : (
            <Link to="/login">← Back</Link>
          )}
        </p>
      </div>
    </div>
  );
}
