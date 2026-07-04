import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

export default function Navbar() {
  const { token } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="navbar-logo-mark" aria-hidden="true">e</span>
          <span className="navbar-wordmark">
            easyurl<span className="navbar-tld">.in</span>
          </span>
        </Link>

        <div className="navbar-links">
          <button
            type="button"
            className="navbar-link"
            onClick={() => scrollToSection("features")}
          >
            Features
          </button>
          <button
            type="button"
            className="navbar-link"
            onClick={() => scrollToSection("pricing")}
          >
            Pricing
          </button>
        </div>

        <div className="navbar-actions">
          <span className="navbar-sep" aria-hidden="true" />
          {token !== null ? (
            <Link to="/dashboard" className="btn navbar-cta">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="navbar-login">Log in</Link>
              <Link to="/login" className="btn navbar-cta">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
