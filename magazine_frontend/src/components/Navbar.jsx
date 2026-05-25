import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaGlobe } from "react-icons/fa";
import "../styles/navbar.css";
import {
  AUTH_STORAGE_EVENT,
  clearAuthStorage,
  getUserRole,
  isAuthenticated
} from "../services/authStorage";
import { useLanguage } from "../context/LanguageContext";

// Affiche la navigation, le changement de langue et les liens selon la session.
function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, options, setLanguage, t } = useLanguage();
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());
  const [userRole, setUserRole] = useState(getUserRole());
  const composeOpen = location.pathname === "/articles/add";
  const showComposeButton =
    loggedIn && location.pathname.startsWith("/articles") && !composeOpen;
  const showAdminLink = loggedIn && userRole === "admin";

  // Synchronise l'affichage de la navbar quand la session change.
  useEffect(() => {
    const syncAuthState = () => {
      setLoggedIn(isAuthenticated());
      setUserRole(getUserRole());
    };

    window.addEventListener("storage", syncAuthState);
    window.addEventListener(AUTH_STORAGE_EVENT, syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener(AUTH_STORAGE_EVENT, syncAuthState);
    };
  }, []);

  // Deconnecte l'utilisateur puis revient a la page d'accueil.
  const handleLogout = (e) => {
    e.preventDefault();
    clearAuthStorage();
    navigate("/");
  };

  return (
    <nav className="navbar">
      <h2 className="logo">Magazine203</h2>

      <div className="nav-links">
        {/* Selecteur de langue global. */}
        <label className="language-switch" aria-label={t("navbar.language")}>
          <FaGlobe />
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {!loggedIn && <Link to="/?mode=login">{t("navbar.login")}</Link>}

        {/* Liens visibles selon l'etat de connexion et le role utilisateur. */}
        <Link to="/articles">{t("navbar.articles")}</Link>

        {loggedIn && <Link to="/my-space">{t("navbar.mySpace")}</Link>}

        {showAdminLink && <Link to="/admin">{t("navbar.admin")}</Link>}

        {showComposeButton && (
          <Link to="/articles/add">
            {t("navbar.addPost")}
          </Link>
        )}

        {loggedIn && (
          <a href="/" onClick={handleLogout}>
            {t("navbar.logout")}
          </a>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
