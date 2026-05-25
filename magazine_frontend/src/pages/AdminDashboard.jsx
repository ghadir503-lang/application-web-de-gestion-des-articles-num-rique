import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEye,
  FaHeart,
  FaNewspaper,
  FaSearch,
  FaShieldAlt,
  FaTrash,
  FaUserCog,
  FaUsers
} from "react-icons/fa";
import api from "../services/api";
import { getMediaAsset } from "../services/mediaStorage";
import { buildAvatar, pickPreferredAvatar } from "../utils/avatar";
import "../styles/admin.css";
import { useLanguage } from "../context/LanguageContext";

const USER_OVERRIDES_STORAGE_KEY = "magazine_admin_user_overrides";
const LOCAL_POSTS_STORAGE_KEY = "magazine_local_posts";
const VIEWS_STORAGE_KEY = "magazine_article_views";
const VIEWERS_STORAGE_KEY = "magazine_article_viewers";
const LIKERS_STORAGE_KEY = "magazine_article_likers";
const COMMENT_REPLIES_STORAGE_KEY = "magazine_comment_replies";
const LOCAL_COMMENTS_STORAGE_KEY = "magazine_local_comments";
const FOLLOWERS_STORAGE_KEY = "magazine_profile_followers";
const FOLLOWING_STORAGE_KEY = "magazine_profile_following";

// Construit la cle IndexedDB/localStorage utilisee pour l'avatar d'un profil.
const getProfileAvatarKey = (email) =>
  `profile-avatar-${normalizeIdentityValue(email).replace(/\s+/g, "_")}`;

// Convertit une valeur en nombre fiable pour les statistiques.
const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Normalise un texte pour les recherches sans accents et sans casse.
const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Formate une date affichee dans le tableau de bord.
const formatDate = (value, locale, fallbackLabel) => {
  if (!value) {
    return fallbackLabel;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallbackLabel;
  }

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

// Charge les modifications locales appliquees aux utilisateurs.
const loadUserOverrides = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_OVERRIDES_STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
};

// Sauvegarde les modifications locales appliquees aux utilisateurs.
const saveUserOverrides = (overrides) => {
  localStorage.setItem(USER_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
};

// Lit une valeur JSON du stockage local avec un fallback.
const loadJsonStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
};

// Normalise une identite pour comparer emails, ids et noms.
const normalizeIdentityValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

// Cree une cle stable pour fusionner les informations d'un utilisateur.
const getUserKey = (user) => {
  const nestedUser = user?.user || {};
  const email = normalizeIdentityValue(user?.email || nestedUser?.email);
  const id = normalizeIdentityValue(user?.id || user?.user_id || nestedUser?.id);
  const name = normalizeIdentityValue(user?.name || user?.userName || nestedUser?.name);

  if (email) {
    return `email:${email}`;
  }

  if (id) {
    return `id:${id}`;
  }

  if (name) {
    return `name:${name}`;
  }

  return "unknown-user";
};

// Fusionne deux versions d'un meme utilisateur dans les statistiques admin.
const mergeDashboardUsers = (currentUser, nextUser) => ({
  ...currentUser,
  ...nextUser,
  id: currentUser.id ?? nextUser.id ?? null,
  email: nextUser.email || currentUser.email || "",
  name: nextUser.name || currentUser.name || "Unknown user",
  avatar:
    pickPreferredAvatar(nextUser.avatar, currentUser.avatar) ||
    buildAvatar(nextUser.name || currentUser.name),
  role: currentUser.role === "admin" || nextUser.role === "admin" ? "admin" : nextUser.role || currentUser.role || "user",
  status:
    currentUser.status === "suspended" || nextUser.status === "suspended"
      ? "suspended"
      : nextUser.status || currentUser.status || "active",
  joinedAt: nextUser.joinedAt || currentUser.joinedAt || "",
  posts: Math.max(numberValue(currentUser.posts), numberValue(nextUser.posts)),
  likes: Math.max(numberValue(currentUser.likes), numberValue(nextUser.likes)),
  comments: Math.max(numberValue(currentUser.comments), numberValue(nextUser.comments)),
  views: Math.max(numberValue(currentUser.views), numberValue(nextUser.views))
});

// Transforme une reponse API ou locale en ligne utilisateur du dashboard.
const normalizeDashboardUser = (rawUser = {}, articleStats = {}, override = {}) => {
  const nestedUser = rawUser.user || {};
  const name =
    override.name ||
    rawUser.name ||
    rawUser.userName ||
    nestedUser.name ||
    rawUser.email ||
    nestedUser.email ||
    "Unknown user";
  const email = rawUser.email || nestedUser.email || "";
  const role = (override.role || rawUser.role || rawUser.userRole || nestedUser.role || "user")
    .toString()
    .toLowerCase();
  const status = (override.status || rawUser.status || "active").toString().toLowerCase();

  return {
    id: rawUser.id ?? rawUser.user_id ?? nestedUser.id ?? null,
    name,
    email,
    avatar:
      pickPreferredAvatar(
        override.avatar,
        rawUser.avatar,
        rawUser.userAvatar,
        nestedUser.avatar
      ) ||
      buildAvatar(name),
    role,
    status,
    joinedAt: rawUser.created_at || rawUser.createdAt || nestedUser.created_at || "",
    posts: numberValue(articleStats.posts),
    likes: numberValue(articleStats.likes),
    comments: numberValue(articleStats.comments),
    views: numberValue(articleStats.views)
  };
};

// Ignore les anciens comptes temporaires qui ne representent pas un vrai utilisateur.
const isDisposablePlaceholderUser = (user) => {
  const normalizedName = normalizeIdentityValue(user?.name);
  const normalizedEmail = normalizeIdentityValue(user?.email);

  return (
    !user?.id &&
    (normalizedName === "you" || normalizedName === "unknown user") &&
    (!normalizedEmail || normalizedEmail === "guest") &&
    numberValue(user?.posts) === 0 &&
    numberValue(user?.likes) === 0 &&
    numberValue(user?.comments) === 0 &&
    numberValue(user?.views) === 0
  );
};

// Recupere l'auteur d'un article quel que soit le format de donnees.
const normalizeArticleAuthor = (article) => {
  const author = article.user || {};
  const fallbackName =
    typeof article.user === "string"
      ? article.user
      : article.authorName || article.author_email || article.authorEmail || "Unknown author";
  const fallbackEmail = article.author_email || article.authorEmail || "";
  const fallbackAvatar = article.avatar || "";
  const fallbackRole = article.authorRole || "user";
  const fallbackCreatedAt = article.created_at || article.createdAt || article.date || "";

  return {
    id: author.id || article.user_id || article.author_id || null,
    name: author.name || author.email || fallbackName,
    email: author.email || fallbackEmail,
    avatar: author.avatar || fallbackAvatar,
    role: author.role || fallbackRole,
    created_at: author.created_at || fallbackCreatedAt
  };
};

// Recupere le nombre de likes d'un article.
const getArticleLikes = (article) =>
  numberValue(article.likes_count ?? article.likesCount ?? article.likes?.length);

// Recupere le nombre de commentaires d'un article.
const getArticleComments = (article) =>
  numberValue(article.comments_count ?? article.commentsCount ?? article.comments?.length);

// Recupere le nombre de vues d'un article.
const getArticleViews = (article) =>
  numberValue(article.views_count ?? article.viewsCount);

// Recupere la date de creation la plus fiable d'un article.
const getArticleCreatedAt = (article) =>
  article.created_at || article.createdAt || article.date || article.updated_at || "";

// Prepare les points SVG du graphique d'activite.
const buildLineChartPoints = (items) => {
  if (items.length === 0) {
    return {
      points: "",
      areaPoints: "",
      mapped: []
    };
  }

  const chartWidth = 320;
  const chartHeight = 180;
  const paddingX = 18;
  const paddingY = 18;
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const stepX = items.length > 1 ? innerWidth / (items.length - 1) : 0;

  const mapped = items.map((item, index) => {
    const x = paddingX + stepX * index;
    const y = paddingY + innerHeight - (item.value / maxValue) * innerHeight;

    return {
      ...item,
      x,
      y
    };
  });

  const points = mapped.map((point) => `${point.x},${point.y}`).join(" ");
  const firstPoint = mapped[0];
  const lastPoint = mapped[mapped.length - 1];
  const areaPoints = `${firstPoint.x},${chartHeight - paddingY} ${points} ${lastPoint.x},${chartHeight - paddingY}`;

  return {
    points,
    areaPoints,
    mapped
  };
};

// Fusionne les articles API et locaux sans doublons.
const mergeArticles = (...articleGroups) => {
  const merged = new Map();

  articleGroups.flat().forEach((article) => {
    if (!article) {
      return;
    }

    const key = String(article.id || `${article.title}-${article.authorEmail || article.user || "post"}`);
    merged.set(key, article);
  });

  return Array.from(merged.values());
};

// Retire un article et ses traces locales des caches navigateur.
const removeArticleFromLocalStorage = (postId) => {
  const postKey = String(postId);
  const localPosts = loadJsonStorage(LOCAL_POSTS_STORAGE_KEY, []);

  localStorage.setItem(
    LOCAL_POSTS_STORAGE_KEY,
    JSON.stringify((Array.isArray(localPosts) ? localPosts : []).filter((post) => String(post.id) !== postKey))
  );

  [VIEWS_STORAGE_KEY, VIEWERS_STORAGE_KEY, LIKERS_STORAGE_KEY, COMMENT_REPLIES_STORAGE_KEY, LOCAL_COMMENTS_STORAGE_KEY].forEach(
    (key) => {
      const current = loadJsonStorage(key, {});
      const next = { ...(current || {}) };
      delete next[postKey];
      localStorage.setItem(key, JSON.stringify(next));
    }
  );

  Object.keys(localStorage).forEach((key) => {
    if (!/^magazine_(liked|saved|viewed)_/.test(key)) {
      return;
    }

    const nextIds = loadJsonStorage(key, []).filter((value) => String(value) !== postKey);
    localStorage.setItem(key, JSON.stringify(nextIds));
  });
};

// Recupere les utilisateurs presents dans les interactions stockees localement.
const collectStoredUsers = () => {
  const peopleMaps = [
    loadJsonStorage(VIEWERS_STORAGE_KEY, {}),
    loadJsonStorage(LIKERS_STORAGE_KEY, {}),
    loadJsonStorage(FOLLOWERS_STORAGE_KEY, {}),
    loadJsonStorage(FOLLOWING_STORAGE_KEY, {})
  ];

  return peopleMaps.flatMap((map) =>
    Object.values(map || {})
      .flatMap((group) => (Array.isArray(group) ? group : []))
      .filter((user) => !isDisposablePlaceholderUser(user))
  );
};

// Essaie plusieurs endpoints pour recuperer les utilisateurs admin.
async function fetchUsersFromApi() {
  const candidateEndpoints = ["/admin/users", "/users", "/profiles"];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await api.get(endpoint);
      const payload = response.data?.data || response.data?.users || response.data?.profiles || response.data;

      if (Array.isArray(payload)) {
        return payload;
      }
    } catch (error) {
      // Try the next endpoint.
    }
  }

  return [];
}

// Synchronise une modification utilisateur avec le backend disponible.
async function syncUserUpdate(userId, payload) {
  const candidateRequests = [
    () => api.patch(`/admin/users/${userId}`, payload),
    () => api.patch(`/users/${userId}`, payload),
    () => api.patch(`/profiles/${userId}`, payload)
  ];

  for (const request of candidateRequests) {
    try {
      await request();
      return true;
    } catch (error) {
      // Try the next endpoint.
    }
  }

  return false;
}

// Affiche les indicateurs, listes et controles de moderation administrateur.
function AdminDashboard() {
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const [articles, setArticles] = useState([]);
  const [users, setUsers] = useState([]);
  const [storedAvatarMap, setStoredAvatarMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savingUserKey, setSavingUserKey] = useState("");
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [userOverrides, setUserOverrides] = useState(loadUserOverrides);

  // Charge les articles depuis l'API puis complete avec les posts locaux.
  useEffect(() => {
    let cancelled = false;

    const fetchDashboardData = async () => {
      const localPosts = loadJsonStorage(LOCAL_POSTS_STORAGE_KEY, []);

      try {
        const response = await api.get("/articles");
        const nextArticles = response.data?.data || response.data || [];

        if (!cancelled) {
          setArticles(
            mergeArticles(
              Array.isArray(nextArticles)
                ? nextArticles.map((article) => ({ ...article, source: "api" }))
                : [],
              Array.isArray(localPosts)
                ? localPosts.map((article) => ({ ...article, source: article.source || "local" }))
                : []
            )
          );
        }
      } catch (error) {
        if (!cancelled) {
          setArticles(Array.isArray(localPosts) ? localPosts : []);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Charge les utilisateurs depuis l'API et les sources locales disponibles.
  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setUsersLoading(true);

      try {
        const nextUsers = await fetchUsersFromApi();
        const localUser = {
          id: localStorage.getItem("userId") || null,
          name: localStorage.getItem("userName") || "",
          email: localStorage.getItem("userEmail") || "",
          role: localStorage.getItem("userRole") || "user",
          avatar: localStorage.getItem("userAvatar") || ""
        };
        const storedUsers = collectStoredUsers();
        const articleAuthors = loadJsonStorage(LOCAL_POSTS_STORAGE_KEY, []).map((article) => ({
          id: article.authorId || null,
          name: article.user || "Unknown author",
          email: article.authorEmail || "",
          avatar: article.avatar || "",
          role: "user"
        }));
        const mergedUsers = [...nextUsers, ...storedUsers, ...articleAuthors];

        if ((localUser.name || localUser.email) && !isDisposablePlaceholderUser(localUser)) {
          mergedUsers.push(localUser);
        }

        if (!cancelled) {
          setUsers(Array.isArray(mergedUsers) ? mergedUsers : []);
        }
      } catch (error) {
        if (!cancelled) {
          const fallbackUsers = [
            ...collectStoredUsers(),
            ...loadJsonStorage(LOCAL_POSTS_STORAGE_KEY, []).map((article) => ({
              id: article.authorId || null,
              name: article.user || "Unknown author",
              email: article.authorEmail || "",
              avatar: article.avatar || "",
              role: "user"
            }))
          ];
          const localUser = {
            id: localStorage.getItem("userId") || null,
            name: localStorage.getItem("userName") || "",
            email: localStorage.getItem("userEmail") || "",
            role: localStorage.getItem("userRole") || "user",
            avatar: localStorage.getItem("userAvatar") || ""
          };

          if ((localUser.name || localUser.email) && !isDisposablePlaceholderUser(localUser)) {
            fallbackUsers.push(localUser);
          }

          setUsers(fallbackUsers);
        }
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persiste les changements locaux de role/statut utilisateur.
  useEffect(() => {
    saveUserOverrides(userOverrides);
  }, [userOverrides]);

  // Recharge les avatars locaux pour enrichir les lignes du dashboard.
  useEffect(() => {
    let cancelled = false;

    const hydrateStoredAvatars = async () => {
      const emails = Array.from(
        new Set(
          [
            ...users.map((user) => user?.email),
            ...articles.map((article) => article?.authorEmail || article?.author_email),
            ...articles.map((article) => article?.user?.email)
          ]
            .map((email) => String(email || "").trim())
            .filter(Boolean)
        )
      );

      if (emails.length === 0) {
        if (!cancelled) {
          setStoredAvatarMap({});
        }
        return;
      }

      const entries = await Promise.all(
        emails.map(async (email) => [email, await getMediaAsset(getProfileAvatarKey(email))])
      );

      if (!cancelled) {
        setStoredAvatarMap(
          Object.fromEntries(entries.filter(([, avatar]) => Boolean(avatar)))
        );
      }
    };

    hydrateStoredAvatars();

    return () => {
      cancelled = true;
    };
  }, [articles, users]);

  // Calcule les statistiques d'articles regroupees par auteur.
  const articleStatsByUser = useMemo(() => {
    const statsMap = new Map();

    articles.forEach((article) => {
      const author = normalizeArticleAuthor(article);
      const key = getUserKey(author);
      const existing = statsMap.get(key) || {
        posts: 0,
        likes: 0,
        comments: 0,
        views: 0
      };

      statsMap.set(key, {
        posts: existing.posts + 1,
        likes: existing.likes + getArticleLikes(article),
        comments: existing.comments + getArticleComments(article),
        views: existing.views + getArticleViews(article)
      });
    });

    return statsMap;
  }, [articles]);

  // Regroupe les indicateurs globaux, les meilleurs posts et les auteurs actifs.
  const dashboard = useMemo(() => {
    const authorMap = new Map();

    const normalizedArticles = articles.map((article) => {
      const likes = getArticleLikes(article);
      const comments = getArticleComments(article);
      const views = getArticleViews(article);
      const engagement = likes + comments + views;
      const author = normalizeArticleAuthor(article);
      const authorKey = getUserKey(author);
      const existingAuthor = authorMap.get(authorKey) || {
        id: author.id,
        name: author.name,
        email: author.email,
        posts: 0,
        likes: 0,
        comments: 0,
        views: 0
      };

      authorMap.set(authorKey, {
        ...existingAuthor,
        posts: existingAuthor.posts + 1,
        likes: existingAuthor.likes + likes,
        comments: existingAuthor.comments + comments,
        views: existingAuthor.views + views
      });

      return {
        id: article.id,
        source: article.source || (article.user || article.user_id || article.author_id ? "api" : "local"),
        title: article.title || article.fileName || article.desc || t("articles.newPost"),
        authorName: author.name,
        likes,
        comments,
        views,
        engagement,
        createdAt: getArticleCreatedAt(article)
      };
    });

    return {
      totalPosts: normalizedArticles.length,
      totalLikes: normalizedArticles.reduce((sum, article) => sum + article.likes, 0),
      totalComments: normalizedArticles.reduce((sum, article) => sum + article.comments, 0),
      totalViews: normalizedArticles.reduce((sum, article) => sum + article.views, 0),
      totalAuthors: authorMap.size,
      topPosts: [...normalizedArticles].sort((a, b) => b.engagement - a.engagement).slice(0, 5),
      recentPosts: [...normalizedArticles]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6),
      topAuthors: Array.from(authorMap.values())
        .sort((a, b) => b.likes + b.comments + b.views - (a.likes + a.comments + a.views))
        .slice(0, 6)
    };
  }, [articles, t]);

  // Construit la liste finale des utilisateurs gerables par l'admin.
  const managedUsers = useMemo(() => {
    const merged = new Map();

    users.forEach((user) => {
      const key = getUserKey(user);
      const stats = articleStatsByUser.get(key) || {};
      const override = userOverrides[key] || {};
      const normalizedUser = normalizeDashboardUser(
        {
          ...user,
          avatar: pickPreferredAvatar(
            storedAvatarMap[user.email],
            user.avatar,
            user.userAvatar,
            user.user?.avatar
          )
        },
        stats,
        override
      );
      const existingUser = merged.get(key);

      merged.set(key, existingUser ? mergeDashboardUsers(existingUser, normalizedUser) : normalizedUser);
    });

    articles.forEach((article) => {
      const author = normalizeArticleAuthor(article);
      const key = getUserKey(author);
      const normalizedAuthor = normalizeDashboardUser(
        {
          ...author,
          avatar: pickPreferredAvatar(
            storedAvatarMap[author.email],
            author.avatar
          )
        },
        articleStatsByUser.get(key) || {},
        userOverrides[key] || {}
      );
      const existingUser = merged.get(key);

      merged.set(key, existingUser ? mergeDashboardUsers(existingUser, normalizedAuthor) : normalizedAuthor);
    });

    return Array.from(merged.values())
      .filter((user) => !isDisposablePlaceholderUser(user))
      .sort((a, b) => {
        const scoreA = a.posts + a.likes + a.comments + a.views;
        const scoreB = b.posts + b.likes + b.comments + b.views;
        return scoreB - scoreA || a.name.localeCompare(b.name);
      });
  }, [articles, articleStatsByUser, storedAvatarMap, userOverrides, users]);

  // Applique les filtres de recherche, role et statut.
  const filteredUsers = useMemo(() => {
    return managedUsers.filter((user) => {
      const query = normalizeSearchText(userSearch);
      const normalizedName = normalizeSearchText(user.name);
      const normalizedEmail = normalizeSearchText(user.email);
      const matchesSearch =
        !query ||
        normalizedName.includes(query) ||
        normalizedEmail.includes(query);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [managedUsers, roleFilter, statusFilter, userSearch]);

  // Calcule les totaux utilisateurs affiches dans les cartes admin.
  const userSummary = useMemo(() => {
    return managedUsers.reduce(
      (summary, user) => {
        summary.total += 1;
        summary[user.role === "admin" ? "admins" : "members"] += 1;
        summary[user.status === "suspended" ? "suspended" : "active"] += 1;
        return summary;
      },
      {
        total: 0,
        admins: 0,
        members: 0,
        active: 0,
        suspended: 0
      }
    );
  }, [managedUsers]);

  // Prepare les donnees du graphique circulaire d'activite.
  const activityChart = useMemo(() => {
    const slices = [
      {
        key: "posts",
        label: t("admin.totalPosts"),
        value: dashboard.totalPosts,
        color: "#38bdf8"
      },
      {
        key: "likes",
        label: t("admin.totalLikes"),
        value: dashboard.totalLikes,
        color: "#f97316"
      },
      {
        key: "comments",
        label: t("admin.comments"),
        value: dashboard.totalComments,
        color: "#a78bfa"
      },
      {
        key: "views",
        label: t("admin.totalViews"),
        value: dashboard.totalViews,
        color: "#22c55e"
      }
    ];

    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    let currentAngle = 0;

    const gradient = slices
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const portion = (slice.value / total) * 360;
        const start = currentAngle;
        const end = currentAngle + portion;
        currentAngle = end;
        return `${slice.color} ${start}deg ${end}deg`;
      })
      .join(", ");

    return {
      total,
      slices: slices.map((slice) => ({
        ...slice,
        percentage: total ? Math.round((slice.value / total) * 100) : 0
      })),
      gradient: gradient || "rgba(148,163,184,0.18) 0deg 360deg"
    };
  }, [
    dashboard.totalComments,
    dashboard.totalLikes,
    dashboard.totalPosts,
    dashboard.totalViews,
    t
  ]);

  // Prepare le graphique des posts les plus engages.
  const topPostsLineChart = useMemo(() => {
    const posts = dashboard.topPosts.map((post, index) => ({
      id: post.id || `${post.title}-${index}`,
      label: `#${index + 1}`,
      title: post.title,
      subtitle: post.authorName,
      value: post.engagement
    }));

    return {
      ...buildLineChartPoints(posts),
      items: posts,
      maxValue: Math.max(...posts.map((post) => post.value), 0)
    };
  }, [dashboard.topPosts]);

  // Prepare les barres des auteurs les plus actifs.
  const topContributorsBars = useMemo(() => {
    const authors = dashboard.topAuthors.map((author, index) => {
      const total = author.likes + author.comments + author.views;
      return {
        id: author.id || author.email || `${author.name}-${index}`,
        label: author.name,
        posts: author.posts,
        total,
        height: 0
      };
    });

    const maxTotal = Math.max(...authors.map((author) => author.total), 0);

    return {
      maxTotal,
      items: authors.map((author) => ({
        ...author,
        height: maxTotal ? Math.max((author.total / maxTotal) * 100, 12) : 0
      }))
    };
  }, [dashboard.topAuthors]);

  // Met a jour le role ou le statut d'un utilisateur.
  const handleUserUpdate = async (user, nextPatch) => {
    const key = getUserKey(user);
    setSavingUserKey(key);

    const nextOverride = {
      ...(userOverrides[key] || {}),
      ...nextPatch
    };

    setUserOverrides((current) => ({
      ...current,
      [key]: nextOverride
    }));

    if (user.id) {
      const synced = await syncUserUpdate(user.id, nextPatch);

      if (!synced) {
        // Keep the local override so the admin UI remains usable even without backend support.
      }
    }

    setSavingUserKey("");
  };

  // Supprime un article depuis le tableau de bord admin.
  const handleDeleteArticle = async (post) => {
    if (!post?.id || deletingPostId) {
      return;
    }

    const confirmed = window.confirm(t("admin.confirmDeletePost"));

    if (!confirmed) {
      return;
    }

    setDeletingPostId(post.id);

    try {
      if (post.source === "api") {
        await api.delete(`/articles/${post.id}`);
      }

      removeArticleFromLocalStorage(post.id);
      setArticles((current) => current.filter((article) => String(article.id) !== String(post.id)));
    } catch (error) {
      window.alert(t("admin.deletePostFailed"));
    } finally {
      setDeletingPostId(null);
    }
  };

  return (
    <div className="admin-page">
      {/* En-tete du tableau de bord administrateur. */}
      <section className="admin-hero">
        <div>
          <span className="admin-badge">
            <FaShieldAlt />
            {t("admin.adminPanel")}
          </span>
          <h1>{t("admin.dashboardAdmin")}</h1>
          <p className="subtitle">
            {t("admin.overviewText")}
          </p>
        </div>
      </section>

      {/* Cartes de statistiques principales. */}
      <section className="admin-stats">
        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <FaNewspaper />
          </span>
          <div>
            <strong>{dashboard.totalPosts}</strong>
            <p>{t("admin.totalPosts")}</p>
          </div>
        </article>

        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <FaUsers />
          </span>
          <div>
            <strong>{userSummary.total}</strong>
            <p>{t("admin.totalUsers")}</p>
          </div>
        </article>

        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <FaHeart />
          </span>
          <div>
            <strong>{dashboard.totalLikes}</strong>
            <p>{t("admin.totalLikes")}</p>
          </div>
        </article>

        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <FaEye />
          </span>
          <div>
            <strong>{dashboard.totalViews}</strong>
            <p>{t("admin.totalViews")}</p>
          </div>
        </article>
      </section>

      <section className="admin-grid">
        <div className="admin-panel admin-panel-chart">
          <div className="admin-panel-head">
            <div>
              <span className="admin-panel-label">{t("admin.activityBreakdown")}</span>
              <h2>{t("admin.activityBreakdownTitle")}</h2>
            </div>
            <span className="admin-panel-count">{activityChart.total}</span>
          </div>

          {loading ? (
            <p className="admin-empty">{t("admin.loadingDashboard")}</p>
          ) : activityChart.total === 0 ? (
            <p className="admin-empty">{t("admin.noChartData")}</p>
          ) : (
            <div className="admin-chart-wrap">
              <div
                className="admin-donut-chart"
                style={{ background: `conic-gradient(${activityChart.gradient})` }}
                aria-label={t("admin.activityBreakdownTitle")}
                role="img"
              >
                <div className="admin-donut-center">
                  <strong>{activityChart.total}</strong>
                  <span>{t("admin.totalActivity")}</span>
                </div>
              </div>

              <div className="admin-chart-legend">
                {activityChart.slices.map((slice) => (
                  <article key={slice.key} className="admin-chart-legend-item">
                    <span
                      className="admin-chart-swatch"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{slice.label}</strong>
                      <p>{slice.value} • {slice.percentage}%</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="admin-right-column">
          <div className="admin-panel admin-panel-overview">
            <div className="admin-panel-head">
              <div>
                <span className="admin-panel-label">{t("admin.overview")}</span>
                <h2>{t("admin.topPosts")}</h2>
              </div>
              <span className="admin-panel-count">{dashboard.topPosts.length}</span>
            </div>

            {loading ? (
              <p className="admin-empty">{t("admin.loadingDashboard")}</p>
            ) : dashboard.topPosts.length === 0 ? (
              <p className="admin-empty">{t("admin.noPostsYet")}</p>
            ) : (
              <div className="admin-line-chart">
                <div className="admin-line-chart-frame">
                  <svg
                    viewBox="0 0 320 180"
                    className="admin-line-chart-svg"
                    aria-label={t("admin.topPostsChartTitle")}
                    role="img"
                  >
                    <defs>
                      <linearGradient id="adminLineFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(14,165,233,0.42)" />
                        <stop offset="100%" stopColor="rgba(14,165,233,0.02)" />
                      </linearGradient>
                    </defs>
                    <line x1="18" y1="162" x2="302" y2="162" className="admin-line-axis" />
                    <line x1="18" y1="18" x2="18" y2="162" className="admin-line-axis" />
                    <polygon points={topPostsLineChart.areaPoints} fill="url(#adminLineFill)" />
                    <polyline points={topPostsLineChart.points} className="admin-line-path" />
                    {topPostsLineChart.mapped.map((point) => (
                      <g key={point.id}>
                        <circle cx={point.x} cy={point.y} r="5" className="admin-line-point" />
                      </g>
                    ))}
                  </svg>
                </div>

                <div className="admin-chart-summary">
                  <strong>{topPostsLineChart.maxValue}</strong>
                  <span>{t("admin.maxEngagement")}</span>
                </div>

                <div className="admin-line-chart-labels">
                  {topPostsLineChart.items.map((post) => (
                    <article key={post.id} className="admin-line-label-card">
                      <strong>{post.label}</strong>
                      <h3>{post.title}</h3>
                      <p>{t("admin.byAuthor")} {post.subtitle}</p>
                      <span>{post.value} {t("admin.points")}</span>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="admin-panel admin-panel-authors">
          <div className="admin-panel-head">
            <div>
              <span className="admin-panel-label">{t("admin.authors")}</span>
              <h2>{t("admin.topContributors")}</h2>
            </div>
            <span className="admin-panel-count">{dashboard.topAuthors.length}</span>
          </div>

          {loading ? (
            <p className="admin-empty">{t("admin.loadingAuthors")}</p>
          ) : dashboard.topAuthors.length === 0 ? (
            <p className="admin-empty">{t("admin.noAuthorsFound")}</p>
          ) : (
            <div className="admin-bar-chart">
              <div className="admin-bar-chart-frame" aria-label={t("admin.topContributorsChartTitle")} role="img">
                {topContributorsBars.items.map((author) => (
                  <article key={author.id} className="admin-bar-group">
                    <div className="admin-bar-track">
                      <div
                        className="admin-bar-fill"
                        style={{ height: `${author.height}%` }}
                      >
                        <span>{author.total}</span>
                      </div>
                    </div>
                    <strong>{author.label}</strong>
                    <p>{author.posts} {t("articles.posts")}</p>
                  </article>
                ))}
              </div>

              <div className="admin-chart-summary">
                <strong>{topContributorsBars.maxTotal}</strong>
                <span>{t("admin.topContributorScore")}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="admin-panel admin-panel-wide">
        <div className="admin-panel-head">
          <div>
            <span className="admin-panel-label">{t("admin.users")}</span>
            <h2>{t("admin.userManagement")}</h2>
          </div>
          <span className="admin-panel-count">{filteredUsers.length}</span>
        </div>

        <div className="admin-user-toolbar">
          <label className="admin-search">
            <FaSearch />
            <input
              type="text"
              placeholder={t("admin.searchByNameOrEmail")}
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />
          </label>

          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">{t("common.allRoles")}</option>
            <option value="admin">{t("common.admin")}</option>
            <option value="user">{t("common.user")}</option>
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">{t("common.allStatus")}</option>
            <option value="active">{t("common.active")}</option>
            <option value="suspended">{t("common.suspended")}</option>
          </select>
        </div>

        <div className="admin-user-summary">
          <article className="admin-user-pill">
            <strong>{userSummary.total}</strong>
            <span>{t("admin.totalUsers")}</span>
          </article>
          <article className="admin-user-pill">
            <strong>{userSummary.admins}</strong>
            <span>{t("admin.admins")}</span>
          </article>
          <article className="admin-user-pill">
            <strong>{userSummary.members}</strong>
            <span>{t("admin.members")}</span>
          </article>
          <article className="admin-user-pill">
            <strong>{userSummary.suspended}</strong>
            <span>{t("common.suspended")}</span>
          </article>
        </div>

        {usersLoading && managedUsers.length === 0 ? (
          <p className="admin-empty">{t("admin.loadingUsers")}</p>
        ) : filteredUsers.length === 0 ? (
          <p className="admin-empty">{t("admin.noUsersMatch")}</p>
        ) : (
          <div className="admin-user-grid">
            {filteredUsers.map((user) => {
              const key = getUserKey(user);
              const isSaving = savingUserKey === key;
              const nextRole = user.role === "admin" ? "user" : "admin";
              const nextStatus = user.status === "suspended" ? "active" : "suspended";

              return (
                <article key={key} className="admin-user-card">
                  <div className="admin-user-head">
                    <div className="admin-user-profile">
                      <img src={user.avatar} alt={user.name} className="admin-user-avatar" />
                      <div>
                        <strong>{user.name}</strong>
                        <p>{user.email || t("admin.noEmailAvailable")}</p>
                      </div>
                    </div>

                    <div className="admin-user-badges">
                      <span className={`admin-role-badge role-${user.role}`}>
                        {user.role === "admin" ? t("common.admin") : t("common.user")}
                      </span>
                      <span className={`admin-status-badge status-${user.status}`}>
                        {user.status === "suspended" ? t("common.suspended") : t("common.active")}
                      </span>
                    </div>
                  </div>

                  <div className="admin-user-metrics">
                    <span>{user.posts} {t("articles.posts")}</span>
                    <span>{user.likes} {t("articles.likes")}</span>
                    <span>{user.comments} {t("admin.comments")}</span>
                    <span>{user.views} {t("articles.views")}</span>
                    <span>{t("admin.joined")} {formatDate(user.joinedAt, locale, t("admin.recently"))}</span>
                  </div>

                  <div className="admin-user-actions">
                    <button
                      type="button"
                      className="admin-action-btn"
                      onClick={() => user.id && navigate(`/profiles/${user.id}`)}
                      disabled={!user.id}
                    >
                      <FaUserCog />
                      {t("admin.openProfile")}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn"
                      onClick={() => handleUserUpdate(user, { role: nextRole })}
                      disabled={isSaving}
                    >
                      {user.role === "admin" ? t("admin.makeUser") : t("admin.makeAdmin")}
                    </button>
                    <button
                      type="button"
                      className={`admin-action-btn ${user.status === "suspended" ? "is-warning" : ""}`}
                      onClick={() => handleUserUpdate(user, { status: nextStatus })}
                      disabled={isSaving}
                    >
                      {user.status === "suspended" ? t("admin.restoreAccess") : t("admin.suspend")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-panel admin-panel-wide">
        <div className="admin-panel-head">
          <div>
            <span className="admin-panel-label">{t("admin.feed")}</span>
            <h2>{t("admin.recentPublications")}</h2>
          </div>
          <span className="admin-panel-count">{dashboard.recentPosts.length}</span>
        </div>

        {loading ? (
          <p className="admin-empty">{t("admin.loadingPublications")}</p>
        ) : dashboard.recentPosts.length === 0 ? (
          <p className="admin-empty">{t("admin.noRecentPosts")}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.title")}</th>
                  <th>{t("admin.author")}</th>
                  <th>{t("articles.likes")}</th>
                  <th>{t("admin.comments")}</th>
                  <th>{t("articles.views")}</th>
                  <th>{t("admin.created")}</th>
                  <th>{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentPosts.map((post, index) => (
                  <tr key={post.id || `${post.title}-${index}`}>
                    <td>{post.title}</td>
                    <td>{post.authorName}</td>
                    <td>{post.likes}</td>
                    <td>{post.comments}</td>
                    <td>{post.views}</td>
                    <td>{formatDate(post.createdAt, locale, t("admin.recently"))}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-table-delete-btn"
                        onClick={() => handleDeleteArticle(post)}
                        disabled={deletingPostId === post.id}
                      >
                        <FaTrash />
                        {deletingPostId === post.id ? t("common.loading") : t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-footer-note">
        <p>
          {t("admin.commentsTracked")}: <strong>{dashboard.totalComments}</strong>
        </p>
        <p>
          {t("admin.localAdminNotice")}
        </p>
      </section>
    </div>
  );
}

export default AdminDashboard;
