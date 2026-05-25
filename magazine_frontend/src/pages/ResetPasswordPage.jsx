import { useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FaLock, FaEye, FaEyeSlash, FaEnvelope } from "react-icons/fa";
import "../styles/auth.css";
import { useLanguage } from "../context/LanguageContext";

function ResetPasswordPage() {
  // Recupere le token de reinitialisation depuis l'URL.
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Gere l'affichage ou le masquage des champs mot de passe.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Indique si le formulaire est en cours d'envoi.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stocke les valeurs saisies dans le formulaire de reinitialisation.
  const [formData, setFormData] = useState({
    email: searchParams.get("email") || "",
    password: "",
    password_confirmation: ""
  });

  // Met a jour le champ modifie dans les donnees du formulaire.
  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  };

  // Verifie les mots de passe puis envoie la demande de reinitialisation au backend.
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formData.password !== formData.password_confirmation) {
      alert(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post("http://127.0.0.1:8000/api/reset-password", {
        token,
        email: formData.email,
        password: formData.password,
        password_confirmation: formData.password_confirmation
      });

      alert(response.data?.message || t("auth.resetPasswordSuccess"));
      navigate("/?mode=login");
    } catch (error) {
      alert(error.response?.data?.message || t("auth.resetPasswordFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-simple-page">
      <div className="auth-simple-card">
        <form onSubmit={handleSubmit}>
          {/* Presente le titre et l'aide de la page de reinitialisation. */}
          <h1>{t("auth.resetPasswordTitle")}</h1>
          <p>{t("auth.resetPasswordHint")}</p>

          {/* Champ email utilise pour identifier le compte a reinitialiser. */}
          <div className="input-icon">
            <FaEnvelope className="icon" />
            <input
              type="email"
              name="email"
              placeholder={t("auth.email")}
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          {/* Champ pour saisir le nouveau mot de passe. */}
          <div className="input-icon">
            <FaLock className="icon" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder={t("auth.password")}
              value={formData.password}
              onChange={handleChange}
              required
            />

            <button
              type="button"
              className="eye eye-button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          {/* Champ pour confirmer le nouveau mot de passe. */}
          <div className="input-icon">
            <FaLock className="icon" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="password_confirmation"
              placeholder={t("auth.confirmPassword")}
              value={formData.password_confirmation}
              onChange={handleChange}
              required
            />

            <button
              type="button"
              className="eye eye-button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              aria-label={
                showConfirmPassword ? t("auth.hidePassword") : t("auth.showPassword")
              }
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          {/* Bouton qui lance la reinitialisation du mot de passe. */}
          <button className="btn-main" disabled={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("auth.resetPasswordAction")}
          </button>

          {/* Lien pour revenir vers le formulaire de connexion. */}
          <Link to="/?mode=login" className="auth-back-link">
            {t("auth.backToLogin")}
          </Link>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
