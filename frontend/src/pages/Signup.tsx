import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/apiClient";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    setLoading(true);
    apiRequest<{ token: string }>("/signup", {
      method: "POST",
      body: { email, password },
    })
      .then((data) => {
        login(data.token);
        void navigate("/dashboard");
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setError("An account with this email already exists");
          } else if (err.status === 400) {
            setError(err.message);
          } else {
            setError("Something went wrong, please try again");
          }
        } else {
          setError("Something went wrong, please try again");
        }
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Create your account</h1>

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
              autoComplete="new-password"
            />
            <span className="text-muted">Minimum 8 characters</span>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
