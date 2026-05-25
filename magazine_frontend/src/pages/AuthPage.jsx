import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaUser, FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import "../styles/auth.css";
import { clearAuthStorage, notifyAuthStorageChange } from "../services/authStorage";
import api from "../services/api";
import { buildAvatar, getAvatarSource } from "../utils/avatar";
import { useLanguage } from "../context/LanguageContext";

// Construit la cle locale qui stocke la bio d'un profil.
const getProfileBioKey = (email) =>
  `profile-bio-${(email || "guest").toLowerCase().replace(/\s+/g, "_")}`;

// Liste les donnees volumineuses a supprimer si le stockage navigateur est plein.
const HEAVY_STORAGE_KEYS = [
  "magazine_local_posts",
  "magazine_local_comments",
  "magazine_article_replies",
  "magazine_comment_replies"
];

// Verifie le format general d'une adresse email.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sauvegarde les donnees de session et libere de l'espace si necessaire.
const setAuthStorageSafely = (entries) => {
  try {
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    return true;
  } catch (error) {
    HEAVY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

    try {
      entries.forEach(([key, value]) => localStorage.setItem(key, value));
      return true;
    } catch (retryError) {
      return false;
    }
  }
};

// Gere les formulaires de connexion, inscription et mot de passe oublie.
function AuthPage() {
  const { language, t } = useLanguage();
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isArabic = language === "ar";

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loginData, setLoginData] = useState({
    email: "",
    password: ""
  });

  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [loginErrors, setLoginErrors] = useState({});
  const [registerErrors, setRegisterErrors] = useState({});
  const [forgotPasswordState, setForgotPasswordState] = useState({
    error: "",
    success: ""
  });
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);

  // Extrait les erreurs envoyees par l'API Laravel.
  const getApiErrorDetails = (error) => {
    const responseData = error?.response?.data;
    const fieldErrors = {};
    const apiErrors = responseData?.errors;

    if (apiErrors && typeof apiErrors === "object") {
      Object.entries(apiErrors).forEach(([field, messages]) => {
        if (Array.isArray(messages) && messages.length > 0) {
          fieldErrors[field] = messages[0];
        }
      });
    }

    return {
      message: responseData?.message || "",
      fieldErrors
    };
  };

  // Choisit le message d'erreur a afficher pour une requete echouee.
  const getRequestErrorMessage = (error, fallbackKey) => {
    if (error?.code === "ERR_NETWORK" || !error?.response) {
      return t("auth.serverUnavailable");
    }

    return error?.response?.data?.message || t(fallbackKey);
  };

  // Valide les champs du formulaire de connexion.
  const validateLoginData = () => {
    const errors = {};

    if (!loginData.email.trim()) {
      errors.email = t("auth.emailRequired");
    } else if (!EMAIL_REGEX.test(loginData.email.trim())) {
      errors.email = t("auth.emailInvalid");
    }

    if (!loginData.password.trim()) {
      errors.password = t("auth.passwordRequired");
    }

    return errors;
  };

  // Valide les champs du formulaire d'inscription.
  const validateRegisterData = () => {
    const errors = {};

    if (!registerData.name.trim()) {
      errors.name = t("auth.usernameRequired");
    } else if (registerData.name.trim().length < 3) {
      errors.name = t("auth.usernameMinLength");
    }

    if (!registerData.email.trim()) {
      errors.email = t("auth.emailRequired");
    } else if (!EMAIL_REGEX.test(registerData.email.trim())) {
      errors.email = t("auth.emailInvalid");
    }

    if (!registerData.password.trim()) {
      errors.password = t("auth.passwordRequired");
    } else if (registerData.password.trim().length < 6) {
      errors.password = t("auth.passwordMinLength");
    }

    if (!registerData.confirmPassword.trim()) {
      errors.confirmPassword = t("auth.confirmPasswordRequired");
    } else if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = t("auth.passwordMismatch");
    }

    return errors;
  };

  // Nettoie une ancienne session quand on revient sur la page d'authentification.
  useEffect(() => {
    clearAuthStorage();
  }, []);

  // Change le panneau affiche selon le parametre d'URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get("mode");

    if (mode === "login") {
      setIsRegister(false);
    }

    if (mode === "register") {
      setIsRegister(true);
    }
  }, [location.search]);

  // Ouvre le panneau de connexion.
  const openLoginMode = () => {
    setIsRegister(false);
    navigate("/?mode=login", { replace: false });
  };

  // Ouvre le panneau d'inscription.
  const openRegisterMode = () => {
    setIsRegister(true);
    navigate("/?mode=register", { replace: false });
  };

  // Met a jour les champs de connexion et efface les erreurs associees.
  const handleLoginChange = (e) => {
    const { name, value } = e.target;

    setLoginData({
      ...loginData,
      [name]: value
    });

    setLoginErrors((current) => ({
      ...current,
      [name]: "",
      form: ""
    }));
    setForgotPasswordState({ error: "", success: "" });
  };

  // Met a jour les champs d'inscription et efface les erreurs associees.
  const handleRegisterChange = (e) => {
    const { name, value } = e.target;

    setRegisterData({
      ...registerData,
      [name]: value
    });

    setRegisterErrors((current) => ({
      ...current,
      [name]: "",
      form: ""
    }));
  };

  // Envoie une demande de lien de reinitialisation du mot de passe.
  const handleForgotPassword = async () => {
    setForgotPasswordState({ error: "", success: "" });

    if (!loginData.email.trim()) {
      setLoginErrors((current) => ({
        ...current,
        email: t("auth.forgotPasswordEnterEmail")
      }));
      return;
    }

    if (!EMAIL_REGEX.test(loginData.email.trim())) {
      setLoginErrors((current) => ({
        ...current,
        email: t("auth.emailInvalid")
      }));
      return;
    }

    try {
      const res = await api.post("/forgot-password", {
        email: loginData.email.trim()
      });

      setForgotPasswordState({
        error: "",
        success: res.data?.message || t("auth.forgotPasswordSent")
      });
    } catch (err) {
      setForgotPasswordState({
        error: err.response?.data?.message || t("auth.forgotPasswordFailed"),
        success: ""
      });
    }
  };

  // Connecte l'utilisateur et stocke ses informations de session.
  const handleLogin = async (e) => {
    e.preventDefault();

    if (isLoginSubmitting) {
      return;
    }

    const validationErrors = validateLoginData();

    if (Object.keys(validationErrors).length > 0) {
      setLoginErrors(validationErrors);
      return;
    }

    setLoginErrors({});
    setIsLoginSubmitting(true);

    try {
      const res = await api.post("/login", {
        email: loginData.email.trim(),
        password: loginData.password
      });
      const userName = res.data.user?.name || loginData.email.split("@")[0] || "You";
      const userEmail = res.data.user?.email || loginData.email;
      const userBio = res.data.user?.bio || "";

      const storageSaved = setAuthStorageSafely([
        ["token", res.data.token],
        ["userId", String(res.data.user?.id || "")],
        ["userName", userName],
        ["userEmail", userEmail],
        ["userRole", res.data.user?.role || res.data.role || "user"],
        ["userAvatar", getAvatarSource(res.data.user)],
        [getProfileBioKey(userEmail), userBio]
      ]);

      if (!storageSaved) {
        setLoginErrors({ form: t("auth.storageFullLogin") });
        return;
      }

      notifyAuthStorageChange();
      navigate("/articles");
    } catch (err) {
      const { message, fieldErrors } = getApiErrorDetails(err);
      const nextErrors = {
        ...fieldErrors,
        form: message || getRequestErrorMessage(err, "auth.loginFailed")
      };

      setLoginErrors(nextErrors);
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  // Cree un nouveau compte puis ouvre directement la session.
  const handleRegister = async (e) => {
    e.preventDefault();

    if (isRegisterSubmitting) {
      return;
    }

    const validationErrors = validateRegisterData();

    if (Object.keys(validationErrors).length > 0) {
      setRegisterErrors(validationErrors);
      return;
    }

    setRegisterErrors({});
    setIsRegisterSubmitting(true);

    try {
      const res = await api.post("/register", {
        ...registerData,
        name: registerData.name.trim(),
        email: registerData.email.trim()
      });
      const userEmail = res.data.user?.email || registerData.email;
      const storageSaved = setAuthStorageSafely([
        ["token", res.data.token],
        ["userId", String(res.data.user?.id || "")],
        ["userName", res.data.user?.name || registerData.name],
        ["userEmail", userEmail],
        ["userRole", res.data.user?.role || "user"],
        [
          "userAvatar",
          getAvatarSource(res.data.user) || buildAvatar(res.data.user?.name || registerData.name)
        ],
        [getProfileBioKey(userEmail), res.data.user?.bio || ""]
      ]);

      if (!storageSaved) {
        setRegisterErrors({ form: t("auth.storageFullRegister") });
        return;
      }

      notifyAuthStorageChange();
      navigate("/articles");
    } catch (err) {
      const { message, fieldErrors } = getApiErrorDetails(err);
      const normalizedFieldErrors = { ...fieldErrors };

      if (normalizedFieldErrors.password_confirmation) {
        normalizedFieldErrors.confirmPassword = normalizedFieldErrors.password_confirmation;
        delete normalizedFieldErrors.password_confirmation;
      }

      setRegisterErrors({
        ...normalizedFieldErrors,
        form: message || getRequestErrorMessage(err, "auth.registerFailed")
      });
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  return (
    <div className={`container ${isRegister ? "right-panel-active" : ""}`}>
      {/* Formulaire de connexion. */}
      <div className="form-container sign-in-container">
        <form onSubmit={handleLogin}>
          <h1>{t("auth.login")}</h1>

          <div className={`input-group ${loginErrors.email ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaEnvelope className="icon" />
              <input
                type="email"
                name="email"
                placeholder={t("auth.email")}
                value={loginData.email}
                onChange={handleLoginChange}
                aria-invalid={Boolean(loginErrors.email)}
              />
            </div>
            {loginErrors.email ? <p className="field-error">{loginErrors.email}</p> : null}
          </div>

          <div className={`input-group ${loginErrors.password ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaLock className="icon" />
              <input
                type={showLoginPassword ? "text" : "password"}
                name="password"
                placeholder={t("auth.password")}
                value={loginData.password}
                onChange={handleLoginChange}
                aria-invalid={Boolean(loginErrors.password)}
              />

              <span
                className="eye"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
              >
                {showLoginPassword ? <FaEye /> : <FaEyeSlash />}
              </span>
            </div>
            {loginErrors.password ? <p className="field-error">{loginErrors.password}</p> : null}
          </div>

          {forgotPasswordState.error ? (
            <p className="form-error form-feedback">{forgotPasswordState.error}</p>
          ) : null}

          {forgotPasswordState.success ? (
            <p className="form-success form-feedback">{forgotPasswordState.success}</p>
          ) : null}

          {loginErrors.form ? <p className="form-error form-feedback">{loginErrors.form}</p> : null}

          <div className="forgot-password-copy">
            <button
              type="button"
              className="forgot-password-title"
              onClick={handleForgotPassword}
            >
              {t("auth.forgotPasswordTitle")}
            </button>
          </div>

          <button type="submit" className="btn-main" disabled={isLoginSubmitting}>
            {isLoginSubmitting ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </form>
      </div>

      {/* Formulaire d'inscription. */}
      <div className="form-container sign-up-container">
        <form onSubmit={handleRegister}>
          <h1>{t("auth.register")}</h1>

          <div className={`input-group ${registerErrors.name ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaUser className="icon" />
              <input
                type="text"
                name="name"
                placeholder={t("auth.username")}
                value={registerData.name}
                onChange={handleRegisterChange}
                aria-invalid={Boolean(registerErrors.name)}
              />
            </div>
            {registerErrors.name ? <p className="field-error">{registerErrors.name}</p> : null}
          </div>

          <div className={`input-group ${registerErrors.email ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaEnvelope className="icon" />
              <input
                type="email"
                name="email"
                placeholder={t("auth.email")}
                value={registerData.email}
                onChange={handleRegisterChange}
                aria-invalid={Boolean(registerErrors.email)}
              />
            </div>
            {registerErrors.email ? <p className="field-error">{registerErrors.email}</p> : null}
          </div>

          <div className={`input-group ${registerErrors.password ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaLock className="icon" />
              <input
                type={showRegisterPassword ? "text" : "password"}
                name="password"
                placeholder={t("auth.password")}
                value={registerData.password}
                onChange={handleRegisterChange}
                aria-invalid={Boolean(registerErrors.password)}
              />

              <span
                className="eye"
                onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              >
                {showRegisterPassword ? <FaEye /> : <FaEyeSlash />}
              </span>
            </div>
            {registerErrors.password ? <p className="field-error">{registerErrors.password}</p> : null}
          </div>

          <div className={`input-group ${registerErrors.confirmPassword ? "has-error" : ""}`}>
            <div className="input-icon">
              <FaLock className="icon" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder={t("auth.confirmPassword")}
                value={registerData.confirmPassword}
                onChange={handleRegisterChange}
                aria-invalid={Boolean(registerErrors.confirmPassword)}
              />

              <span
                className="eye"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <FaEye /> : <FaEyeSlash />}
              </span>
            </div>
            {registerErrors.confirmPassword ? (
              <p className="field-error">{registerErrors.confirmPassword}</p>
            ) : null}
          </div>

          {registerErrors.form ? (
            <p className="form-error form-feedback">{registerErrors.form}</p>
          ) : null}

          <button type="submit" className="btn-main" disabled={isRegisterSubmitting}>
            {isRegisterSubmitting ? t("auth.registering") : t("auth.register")}
          </button>
        </form>
      </div>

      {/* Panneau de bascule entre connexion et inscription. */}
      <div className="overlay-container">
        {isArabic ? (
          <div className="overlay is-single-panel">
            <div className="overlay-panel overlay-panel-single">
              <h1>{isRegister ? t("auth.welcomeBack") : t("auth.helloFriend")}</h1>
              <p>{isRegister ? t("auth.alreadyHaveAccount") : t("auth.createAccount")}</p>
              <button
                className="btn-switch"
                onClick={() => (isRegister ? openLoginMode() : openRegisterMode())}
              >
                {isRegister ? t("auth.login") : t("auth.register")}
              </button>
            </div>
          </div>
        ) : (
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>{t("auth.welcomeBack")}</h1>
              <p>{t("auth.alreadyHaveAccount")}</p>
              <button className="btn-switch" onClick={openLoginMode}>
                {t("auth.login")}
              </button>
            </div>

            <div className="overlay-panel overlay-right">
              <h1>{t("auth.helloFriend")}</h1>
              <p>{t("auth.createAccount")}</p>
              <button className="btn-switch" onClick={openRegisterMode}>
                {t("auth.register")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthPage;




