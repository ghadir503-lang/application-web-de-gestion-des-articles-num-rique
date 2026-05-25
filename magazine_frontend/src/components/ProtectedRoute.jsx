import { Navigate, useLocation } from "react-router-dom";
import { getUserRole, isAuthenticated } from "../services/authStorage";

// Protege une route selon l'etat de connexion et le role admin si necessaire.
function ProtectedRoute({ children, adminOnly = false }) {
  const location = useLocation();

  // Redirige un visiteur non connecte vers la page d'accueil.
  if (!isAuthenticated()) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Bloque les pages admin pour les comptes non administrateurs.
  if (adminOnly && getUserRole() !== "admin") {
    return <Navigate to="/articles" replace />;
  }

  return children;
}

export default ProtectedRoute;
