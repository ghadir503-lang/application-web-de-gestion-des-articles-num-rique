const API_BASE_URL = "http://127.0.0.1:8000/api";
const API_ORIGIN = new URL(API_BASE_URL).origin;
const DEFAULT_MALE_AVATAR = "https://i.pravatar.cc/100?img=12";

// Fournit un avatar par defaut quand aucun avatar utilisateur n'existe.
export const buildAvatar = (value) =>
  DEFAULT_MALE_AVATAR;

// Detecte les avatars generes automatiquement.
export const isGeneratedAvatar = (avatar) =>
  typeof avatar === "string" && avatar.includes("i.pravatar.cc/100");

// Convertit un chemin d'avatar relatif ou absolu en URL utilisable.
export const resolveAvatarUrl = (avatar) => {
  if (!avatar || typeof avatar !== "string") {
    return "";
  }

  const trimmedAvatar = avatar.trim();

  if (!trimmedAvatar) {
    return "";
  }

  if (
    trimmedAvatar.startsWith("data:") ||
    trimmedAvatar.startsWith("blob:") ||
    /^https?:\/\//i.test(trimmedAvatar)
  ) {
    return trimmedAvatar;
  }

  if (trimmedAvatar.startsWith("/")) {
    return `${API_ORIGIN}${trimmedAvatar}`;
  }

  return `${API_ORIGIN}/${trimmedAvatar.replace(/^\.?\//, "")}`;
};

// Retourne la meilleure source d'avatar disponible pour un utilisateur.
export const getAvatarSource = (user) =>
  resolveAvatarUrl(user?.avatar || user?.userAvatar) || buildAvatar(user?.name);

// Choisit le premier avatar reel avant de retomber sur un avatar genere.
export const pickPreferredAvatar = (...avatars) => {
  const resolved = avatars
    .map((avatar) => resolveAvatarUrl(avatar))
    .filter(Boolean);

  return resolved.find((avatar) => !isGeneratedAvatar(avatar)) || resolved[0] || "";
};
