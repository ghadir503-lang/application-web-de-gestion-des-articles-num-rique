export const AUTH_STORAGE_EVENT = "auth-storage-changed";

// Liste les cles locales liees a la session utilisateur.
const AUTH_KEYS = [
  "token",
  "userId",
  "userName",
  "userEmail",
  "userRole",
  "userAvatar"
];

// Recupere le token d'authentification stocke dans le navigateur.
export const getAuthToken = () => localStorage.getItem("token");

// Recupere le role de l'utilisateur courant.
export const getUserRole = () => localStorage.getItem("userRole") || "user";

// Indique si un utilisateur est connecte.
export const isAuthenticated = () => Boolean(getAuthToken());

// Informe les composants que les donnees d'authentification ont change.
export const notifyAuthStorageChange = () => {
  window.dispatchEvent(new Event(AUTH_STORAGE_EVENT));
};

// Supprime les donnees de session et previent l'interface.
export const clearAuthStorage = () => {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
  notifyAuthStorageChange();
};
