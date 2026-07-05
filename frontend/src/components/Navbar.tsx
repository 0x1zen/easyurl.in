import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function NavHamburger() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
}

export default function Navbar() {
  const { token } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  function close() {
    setNavOpen(false);
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand" onClick={close}>
          <img src="https://res.cloudinary.com/dwokx2ugh/image/upload/v1783216133/favicon-48_zot5eo.png" width={28} height={28} alt="" className="navbar-logo-mark" />
          <span className="navbar-wordmark">
            easyurl<span className="navbar-tld">.in</span>
          </span>
        </Link>

        {/* Desktop actions */}
        <div className="navbar-actions">
          {token !== null ? (
            <Link to="/dashboard" className="btn navbar-cta">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="navbar-login">Log in</Link>
              <Link to="/login" className="btn navbar-cta">Get Started</Link>
            </>
          )}
        </div>

        {/* Mobile: hamburger toggle */}
        <button
          type="button"
          className="navbar-hamburger"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <NavHamburger />
        </button>
      </div>

      {/* Mobile dropdown — React-controlled, only in DOM when open */}
      {navOpen && (
        <div className="navbar-mobile-menu">
          {token !== null ? (
            <Link to="/dashboard" className="btn navbar-mobile-cta" onClick={close}>
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="navbar-mobile-link" onClick={close}>
                Log in
              </Link>
              <Link to="/login" className="btn navbar-mobile-cta" onClick={close}>
                Get Started
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
