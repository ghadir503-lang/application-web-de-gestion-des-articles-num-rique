import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Articles from "./pages/Articles";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import { LanguageProvider } from "./context/LanguageContext";

// Configure les routes principales et les protections d'acces de l'application.
function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        {/* Barre de navigation partagee par toutes les pages. */}
        <Navbar />

        {/* Table de routage entre authentification, articles, profils et admin. */}
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Liste des articles accessible seulement aux utilisateurs connectes. */}
          <Route
            path="/articles"
            element={
              <ProtectedRoute>
                <Articles />
              </ProtectedRoute>
            }
          />

          {/* Page de creation d'article protegee. */}
          <Route
            path="/articles/add"
            element={
              <ProtectedRoute>
                <Articles />
              </ProtectedRoute>
            }
          />

          {/* Espace personnel de l'utilisateur connecte. */}
          <Route
            path="/my-space"
            element={
              <ProtectedRoute>
                <Articles />
              </ProtectedRoute>
            }
          />

          {/* Detail d'un article. */}
          <Route
            path="/articles/:id"
            element={
              <ProtectedRoute>
                <Articles />
              </ProtectedRoute>
            }
          />

          {/* Profil public d'un utilisateur. */}
          <Route
            path="/profiles/:id"
            element={
              <ProtectedRoute>
                <Articles />
              </ProtectedRoute>
            }
          />

          {/* Tableau de bord reserve aux administrateurs. */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
