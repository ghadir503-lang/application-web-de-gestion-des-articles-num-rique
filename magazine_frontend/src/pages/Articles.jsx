import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FaHeart,
  FaRegHeart,
  FaComment,
  FaBookmark,
  FaRegBookmark,
  FaEye,
  FaReply,
  FaAlignLeft,
  FaFileUpload,
  FaFont,
  FaPlus,
  FaCheck
} from "react-icons/fa";

import ArticleCard from "../components/ArticleCard";
import api from "../services/api";
import { getMediaAsset, saveMediaAsset } from "../services/mediaStorage";
import { AUTH_STORAGE_EVENT } from "../services/authStorage";
import "../styles/articles.css";
import "../styles/articleDetails.css";
import { useLanguage } from "../context/LanguageContext";
import {
  buildAvatar,
  getAvatarSource,
  pickPreferredAvatar,
  resolveAvatarUrl
} from "../utils/avatar";

const STORAGE_KEY = "magazine_local_posts";
const VIEWS_STORAGE_KEY = "magazine_article_views";
const VIEWERS_STORAGE_KEY = "magazine_article_viewers";
const LIKERS_STORAGE_KEY = "magazine_article_likers";
const FOLLOWERS_STORAGE_KEY = "magazine_profile_followers";
const FOLLOWING_STORAGE_KEY = "magazine_profile_following";
const COMMENT_REPLIES_STORAGE_KEY = "magazine_comment_replies";
const LOCAL_COMMENTS_STORAGE_KEY = "magazine_local_comments";
const INTERACTION_STORAGE_VERSION_KEY = "magazine_interaction_storage_version";
const INTERACTION_STORAGE_VERSION = "2";

// Convertit un fichier local en URL data pour l'affichage immediat.
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Normalise une valeur utilisateur pour les comparaisons locales.
const normalizeUserKey = (value) =>
  (value || "guest").toLowerCase().replace(/\s+/g, "_");

// Compare deux valeurs utilisateur apres normalisation.
const sameUserValue = (left, right) =>
  normalizeUserKey(left) === normalizeUserKey(right);

// Construit la cle de stockage local de la bio.
const getProfileBioKey = (email) => `profile-bio-${normalizeUserKey(email)}`;

// Recupere le profil connecte depuis le stockage local.
const getProfile = () => {
  const savedId = localStorage.getItem("userId");
  const savedName = localStorage.getItem("userName");
  const savedAvatar = localStorage.getItem("userAvatar");
  const savedEmail = localStorage.getItem("userEmail");
  const savedRole = localStorage.getItem("userRole");
  const savedBio = localStorage.getItem(getProfileBioKey(savedEmail || savedName || "guest"));

  return {
    userId: savedId ? Number(savedId) : null,
    userName: savedName || "You",
    userAvatar: resolveAvatarUrl(savedAvatar) || buildAvatar(savedName || "You"),
    userEmail: savedEmail || savedName || "guest",
    userRole: savedRole || "user",
    userBio: savedBio || ""
  };
};

// Construit la cle de stockage local de l'avatar.
const getProfileAvatarKey = (email) =>
  `profile-avatar-${normalizeUserKey(email)}`;

// Determine le type de media choisi par l'utilisateur.
const getFileType = (file) => {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return "pdf";
};

// Lit une entree JSON du stockage local.
const loadJsonStorage = (key, fallback) => {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

// Sauvegarde une entree JSON avec fallback si le stockage est plein.
const saveJsonStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (key === STORAGE_KEY && Array.isArray(value)) {
      try {
        const lightweightPosts = serializeLocalPosts(value);
        localStorage.setItem(key, JSON.stringify(lightweightPosts));
      } catch (storageError) {
        try {
          const compactPosts = compactLocalPosts(value);
          localStorage.setItem(key, JSON.stringify(compactPosts));
        } catch (finalError) {
          localStorage.removeItem(key);
        }
      }
      return;
    }

    if (
      [
        VIEWERS_STORAGE_KEY,
        LIKERS_STORAGE_KEY,
        FOLLOWERS_STORAGE_KEY,
        FOLLOWING_STORAGE_KEY
      ].includes(key) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      try {
        localStorage.setItem(key, JSON.stringify(compactPeopleMap(value)));
      } catch (finalError) {
        localStorage.removeItem(key);
      }
    }
  }
};

// Nettoie les anciennes donnees d'interactions incompatibles.
const migrateLegacyInteractionStorage = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (localStorage.getItem(INTERACTION_STORAGE_VERSION_KEY) === INTERACTION_STORAGE_VERSION) {
      return;
    }

    const rawLocalPosts = localStorage.getItem(STORAGE_KEY);

    if (rawLocalPosts) {
      const parsedLocalPosts = JSON.parse(rawLocalPosts);

      if (Array.isArray(parsedLocalPosts)) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            parsedLocalPosts.map((post) => ({
              ...post,
              viewedBy: []
            }))
          )
        );
      }
    }

    localStorage.removeItem(VIEWERS_STORAGE_KEY);
    localStorage.setItem(INTERACTION_STORAGE_VERSION_KEY, INTERACTION_STORAGE_VERSION);
  } catch (error) {
    localStorage.removeItem(VIEWERS_STORAGE_KEY);
    localStorage.setItem(INTERACTION_STORAGE_VERSION_KEY, INTERACTION_STORAGE_VERSION);
  }
};

// Prepare les posts locaux pour le stockage.
const serializeLocalPosts = (posts = []) =>
  posts.map((post) => ({
    ...post,
    mediaSrc: post.mediaKey ? "" : post.mediaSrc,
    avatar: post.avatar?.startsWith("data:") ? "" : post.avatar
  }));

// Reduit les posts locaux quand le stockage navigateur est limite.
const compactLocalPosts = (posts = []) =>
  posts.map((post) => ({
    id: post.id,
    source: post.source,
    title: post.title,
    desc: post.desc,
    content: post.desc || post.content || "",
    mediaType: post.mediaType,
    mediaSrc: "",
    mediaKey: post.mediaKey || null,
    fileName: post.fileName || post.title || "Post",
    user: post.user,
    authorId: post.authorId || null,
    authorEmail: post.authorEmail || null,
    avatar: post.avatar?.startsWith("data:") ? "" : post.avatar || "",
    likesCount: Number(post.likesCount || 0),
    commentsCount: Number(post.commentsCount || 0),
    viewsCount: Number(post.viewsCount || 0),
    liked: Boolean(post.liked),
    saved: Boolean(post.saved),
    likedBy: [],
    viewedBy: [],
    comments: []
  }));

// Detecte les anciens placeholders qui ne representent pas un vrai compte.
const isDisposablePlaceholderPerson = (person) => {
  const normalizedPerson =
    typeof person === "string"
      ? {
          id: null,
          email: "",
          name: person
        }
      : {
          id: person?.id ?? person?.user_id ?? person?.user?.id ?? null,
          email: person?.email || person?.user?.email || "",
          name:
            person?.name ||
            person?.userName ||
            person?.user?.name ||
            person?.email ||
            person?.user?.email ||
            ""
        };

  return (
    !normalizedPerson.id &&
    normalizeUserKey(normalizedPerson.name) === "you" &&
    (!normalizedPerson.email || normalizeUserKey(normalizedPerson.email) === "guest")
  );
};

// Reduit les donnees personnes avant stockage.
const compactPeopleRecords = (people = []) =>
  normalizePeopleRecords(people)
    .filter((person) => !isDisposablePlaceholderPerson(person))
    .map((person) => ({
      id: person.id ?? null,
      email: person.email || "",
      name: person.name || "User",
      avatar: person.avatar?.startsWith("data:") ? "" : person.avatar || ""
    }));

// Reduit une map de personnes avant stockage.
const compactPeopleMap = (peopleMap = {}) =>
  Object.fromEntries(
    Object.entries(peopleMap).map(([entityId, people]) => [entityId, compactPeopleRecords(people)])
  );

// Charge les posts crees localement.
const loadLocalPosts = () =>
  serializeLocalPosts(loadJsonStorage(STORAGE_KEY, [])).map((post) => ({
    ...post,
    avatar: post.avatar || buildAvatar(post.user)
  }));
// Charge les compteurs de vues sauvegardes localement.
const loadStoredViews = () => loadJsonStorage(VIEWS_STORAGE_KEY, {});

// Charge les personnes stockees pour likes, vues et follows.
const loadStoredPeople = (key) =>
  Object.fromEntries(
    Object.entries(loadJsonStorage(key, {})).map(([entityId, people]) => [
      entityId,
      normalizePeopleRecords(Array.isArray(people) ? people : []).filter(
        (person) => !isDisposablePlaceholderPerson(person)
      )
    ])
  );

// Construit une cle de stockage propre a un utilisateur.
const userScopedKey = (type, userName) =>
  `magazine_${type}_${normalizeUserKey(userName)}`;

// Convertit les ids stockes en nombres quand c'est possible.
const normalizeStoredIds = (values = []) =>
  Array.isArray(values)
    ? values.map((value) => {
        if (typeof value === "string" && /^-?\d+$/.test(value)) {
          const numericValue = Number(value);
          return Number.isSafeInteger(numericValue) ? numericValue : value;
        }

        return value;
      })
    : [];

// Charge les ids d'interactions d'un utilisateur.
const loadUserIds = (type, userName) =>
  normalizeStoredIds(loadJsonStorage(userScopedKey(type, userName), []));

// Extrait la liste des viewers depuis une reponse API de profil.
const getProfileViewersResponseData = (payload) => {
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
};

// Normalise les reponses de commentaires.
const normalizeReplies = (replies = []) =>
  replies.map((reply) => ({
    id: reply.id,
    text: reply.text,
    user: reply.user
  }));

// Fusionne commentaires API et commentaires locaux.
const mergeComments = (baseComments = [], localComments = [], hiddenComments = []) => {
  const mergedMap = new Map();

  [...baseComments, ...localComments].forEach((comment) => {
    const existingComment = mergedMap.get(comment.id);

    if (!existingComment) {
      mergedMap.set(comment.id, comment);
      return;
    }

    mergedMap.set(comment.id, {
      ...existingComment,
      ...comment,
      // Keep whichever version already has replies so local storage comments
      // do not wipe the reply thread rendered for the same comment id.
      replies:
        normalizeReplies(comment.replies || []).length > 0
          ? normalizeReplies(comment.replies || [])
          : normalizeReplies(existingComment.replies || [])
    });
  });

  return Array.from(mergedMap.values()).filter(
    (comment) => !hiddenComments.includes(comment.id)
  );
};

// Cree une cle stable pour identifier une personne.
const getPersonKey = (person) =>
  String(
    person?.email ||
      person?.id ||
      normalizeUserKey(person?.name || person)
  );

// Uniformise les formats utilisateur/personne venant du backend ou du local.
const normalizePersonRecord = (person) => {
  if (!person) {
    return null;
  }

  if (typeof person === "string") {
    return {
      id: null,
      email: "",
      name: person,
      avatar: buildAvatar(person)
    };
  }

  const nestedUser = person.user || {};
  const name =
    person.name ||
    person.userName ||
    nestedUser.name ||
    person.email ||
    nestedUser.email ||
    "User";
  const email = person.email || nestedUser.email || "";

  return {
    id: nestedUser.id ?? person.user_id ?? person.id ?? null,
    email,
    name,
    avatar:
      pickPreferredAvatar(
        person.avatar,
        person.userAvatar,
        person.profile_picture,
        person.profilePicture,
        person.photo,
        person.image,
        nestedUser.avatar,
        nestedUser.userAvatar,
        nestedUser.profile_picture,
        nestedUser.profilePicture,
        nestedUser.photo,
        nestedUser.image
      ) || buildAvatar(name)
  };
};

// Normalise une liste de personnes.
const normalizePeopleRecords = (people = []) =>
  people
    .map((person) => normalizePersonRecord(person))
    .filter(Boolean);

// Met a jour les informations d'un profil dans les personnes stockees.
const updateStoredPeopleProfile = (peopleMap, previousName, nextProfile) => {
  const nextEntries = Object.entries(peopleMap).map(([articleId, people]) => [
    articleId,
    normalizePeopleRecords(people).map((person) =>
      sameUserValue(person.name, previousName)
        ? {
            ...person,
            name: nextProfile.name,
            avatar: nextProfile.avatar || person.avatar,
            email: nextProfile.email || person.email,
            id: nextProfile.id ?? person.id
          }
        : person
    )
  ]);

  return Object.fromEntries(nextEntries);
};

// Synchronise le profil courant dans une map de personnes.
const syncProfileInPeopleMap = (peopleMap, nextProfile) =>
  Object.fromEntries(
    Object.entries(peopleMap || {}).map(([entityId, people]) => [
      entityId,
      normalizePeopleRecords(people).map((person) =>
        isSamePersonRecord(person, nextProfile)
          ? {
              ...person,
              id: nextProfile.id ?? person.id,
              email: nextProfile.email || person.email,
              name: nextProfile.name || person.name,
              avatar: nextProfile.avatar || person.avatar
            }
          : person
      )
    ])
  );

// Fusionne deux fiches personne en gardant les meilleures donnees.
const mergePersonDirectoryEntries = (currentPerson, nextPerson) => {
  if (!currentPerson) {
    return nextPerson;
  }

  if (!nextPerson) {
    return currentPerson;
  }

  return {
    ...currentPerson,
    ...nextPerson,
    id: currentPerson.id ?? nextPerson.id ?? null,
    email: nextPerson.email || currentPerson.email || "",
    name: nextPerson.name || currentPerson.name || "User",
    avatar:
      pickPreferredAvatar(nextPerson.avatar, currentPerson.avatar) ||
      buildAvatar(nextPerson.name || currentPerson.name || "User")
  };
};

// Remplace l'ancien profil par le profil actuel dans les posts.
const syncProfileInPosts = (postsList, nextProfile) =>
  postsList.map((post) => ({
    ...post,
    likedBy: (post.likedBy || []).map((person) =>
      isSamePersonRecord(person, nextProfile)
        ? {
            ...normalizePersonRecord(person),
            id: nextProfile.id ?? normalizePersonRecord(person)?.id ?? null,
            email: nextProfile.email || normalizePersonRecord(person)?.email || "",
            name: nextProfile.name || normalizePersonRecord(person)?.name || "User",
            avatar: nextProfile.avatar || normalizePersonRecord(person)?.avatar || ""
          }
        : normalizePersonRecord(person)
    ),
    viewedBy: (post.viewedBy || []).map((person) =>
      isSamePersonRecord(person, nextProfile)
        ? {
            ...normalizePersonRecord(person),
            id: nextProfile.id ?? normalizePersonRecord(person)?.id ?? null,
            email: nextProfile.email || normalizePersonRecord(person)?.email || "",
            name: nextProfile.name || normalizePersonRecord(person)?.name || "User",
            avatar: nextProfile.avatar || normalizePersonRecord(person)?.avatar || ""
          }
        : normalizePersonRecord(person)
    )
  }));

// Compare deux personnes avec id, email puis nom.
const isSamePersonRecord = (leftPerson, rightPerson) => {
  const left = normalizePersonRecord(leftPerson);
  const right = normalizePersonRecord(rightPerson);

  if (!left || !right) {
    return false;
  }

  if (left.id != null && right.id != null && String(left.id) === String(right.id)) {
    return true;
  }

  if (left.email && right.email && sameUserValue(left.email, right.email)) {
    return true;
  }

  return sameUserValue(left.name, right.name);
};

// Construit une map article -> personnes depuis les likes ou vues API.
const buildPeopleMapFromApiArticles = (articles = [], field) =>
  Object.fromEntries(
    articles.map((article) => [
      String(article?.id),
      normalizePeopleRecords(
        (field === "likedBy" ? article?.likes : article?.views)
          ?.map((entry) => entry?.user)
          .filter(Boolean) || []
      )
    ])
  );

// Deduit le type de media depuis les URLs backend.
const getMediaTypeFromUrl = (image, video) => {
  if (video) {
    return "video";
  }

  if (!image) {
    return "image";
  }

  return image.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
};

// Fusionne plusieurs listes de personnes sans doublons.
const mergePeopleRecords = (...groups) => {
  const merged = [];

  groups
    .flatMap((group) => normalizePeopleRecords(group))
    .filter((person) => !isDisposablePlaceholderPerson(person))
    .forEach((person) => {
    const existingIndex = merged.findIndex((entry) => isSamePersonRecord(entry, person));

    if (existingIndex >= 0) {
      merged[existingIndex] = mergePersonDirectoryEntries(merged[existingIndex], person);
      return;
    }

    merged.push(person);
  });

  return merged;
};

// Verifie si une personne existe deja dans un groupe.
const hasPersonInGroup = (group = [], person) => {
  const normalizedPerson = normalizePersonRecord(person);

  if (!normalizedPerson) {
    return false;
  }

  return normalizePeopleRecords(group).some((entry) =>
    isSamePersonRecord(entry, normalizedPerson)
  );
};

// Detecte une ancienne vue fantome sans vrai compte.
const isGhostViewerRecord = (person) => {
  const normalizedPerson = normalizePersonRecord(person);

  if (!normalizedPerson) {
    return false;
  }

  return (
    normalizeUserKey(normalizedPerson.name) === "you" &&
    !normalizedPerson.id &&
    !normalizedPerson.email
  );
};

// Detecte un compte placeholder a masquer dans l'interface.
const isHiddenPlaceholderAccount = (person) => {
  const normalizedPerson = normalizePersonRecord(person);

  if (!normalizedPerson) {
    return false;
  }

  return (
    normalizeUserKey(normalizedPerson.name) === "you" &&
    !normalizedPerson.id &&
    !normalizedPerson.email
  );
};

// Compte les anciennes vues fantomes.
const countGhostViewerRecords = (people = []) =>
  normalizePeopleRecords(people).filter((person) => isGhostViewerRecord(person)).length;

// Recupere les personnes d'un post depuis la collection courante.
const getPostPeopleFromCollection = (posts = [], postId, field) =>
  posts
    .filter((post) => String(post.id) === String(postId))
    .flatMap((post) => post?.[field] || []);

// Synchronise le follow/unfollow avec les endpoints backend disponibles.
const syncFollowWithBackend = async (profileId, shouldFollow) => {
  try {
    let response;

    if (shouldFollow) {
      response = await api.post(`/profiles/${profileId}/follow`);
    } else {
      response = await api.delete(`/profiles/${profileId}/follow`);
    }

    return getProfileResponseData(response?.data);
  } catch (primaryError) {
    try {
      let response;

      if (shouldFollow) {
        response = await api.post("/follows", { following_id: profileId });
      } else {
        response = await api.delete(`/follows/${profileId}`);
      }

      return getProfileResponseData(response?.data);
    } catch (secondaryError) {
      return null;
    }
  }
};

// Envoie la bio modifiee au backend.
const syncBioWithBackend = async (bio) => {
  try {
    await api.patch("/me", { bio });
    return true;
  } catch (error) {
    return false;
  }
};

// Extrait le profil depuis une reponse API.
const getProfileResponseData = (payload) =>
  payload?.data || payload?.profile || payload?.user || payload || null;

// Recupere une statistique de profil en snake_case ou camelCase.
const getProfileMetric = (data, snakeKey, camelKey, fallback = 0) => {
  const value = data?.[snakeKey] ?? data?.[camelKey];

  return Number.isFinite(Number(value)) ? Number(value) : fallback;
};

// Formate la date d'inscription d'un profil.
const formatProfileDate = (value, locale) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

// Normalise les donnees de profil pour l'interface.
const normalizeProfileResponse = (payload, fallbackId = null) => {
  const data = getProfileResponseData(payload);

  if (!data) {
    return null;
  }

  const nestedUser = data.user || null;
  const name = data.name || data.userName || data.username || nestedUser?.name || "Profile";

  return {
    id: data.id ?? data.profile_id ?? data.user_id ?? nestedUser?.id ?? fallbackId,
    name,
    email: data.email || data.userEmail || nestedUser?.email || "",
    avatar: resolveAvatarUrl(data.avatar || data.userAvatar || nestedUser?.avatar) || "",
    bio: data.bio || data.description || "",
    followers_count: getProfileMetric(data, "followers_count", "followersCount", 0),
    following_count: getProfileMetric(data, "following_count", "followingCount", 0),
    posts_count: getProfileMetric(data, "posts_count", "postsCount", 0),
    likes_count: getProfileMetric(data, "likes_count", "likesCount", 0),
    views_count: getProfileMetric(data, "views_count", "viewsCount", 0),
    is_following: Boolean(data.is_following ?? data.isFollowing),
    role: data.role || data.userRole || nestedUser?.role || "",
    username: data.username || nestedUser?.username || "",
    created_at: data.created_at || data.createdAt || nestedUser?.created_at || nestedUser?.createdAt || ""
  };
};

// Transforme un article backend en article utilisable par l'interface.
const normalizeArticle = (
  article,
  likedIds = [],
  savedIds = [],
  storedViews = {},
  storedViewers = {},
  storedLikers = {},
  localCommentsMap = {},
  localCommentReplies = {},
  hiddenComments = []
) => {
  const authorName = article.user?.name || "Magazine203";
  const image = article.image || null;
  const video = article.video || null;
  const commentReplies = localCommentReplies[String(article.id)] || {};
  const localComments = localCommentsMap[String(article.id)] || [];
  const baseComments =
    article.comments?.map((comment) => ({
      id: comment.id,
      text: comment.content,
      user: comment.user?.name || "User",
      source: "api",
      replies: normalizeReplies(commentReplies[String(comment.id)] || [])
    })) || [];
  const likedBy = normalizePeopleRecords(
    article.likes?.map((like) => like.user || like) || []
  );
  const backendViewsCount = Number(article.views_count ?? article.viewsCount);
  const viewedBy = normalizePeopleRecords(
    article.views?.map((view) => view?.user).filter(Boolean) || []
  );

  return {
    id: article.id,
    source: "api",
    title: article.title,
    desc: article.content?.slice(0, 120) || "",
    content: article.content || "",
    mediaType: getMediaTypeFromUrl(image, video),
    mediaSrc: video || image || "",
    mediaKey: null,
    fileName: article.title,
    user: authorName,
    authorId: article.user?.id || null,
    authorEmail: article.user?.email || null,
    avatar: getAvatarSource(article.user),
    likesCount: article.likes_count ?? article.likes?.length ?? 0,
    commentsCount: article.comments_count ?? article.comments?.length ?? 0,
    viewsCount: Number.isFinite(backendViewsCount)
      ? Math.max(backendViewsCount, Number(storedViews[String(article.id)] || 0))
      : Number(storedViews[String(article.id)] || 0),
    liked: article.liked_by_user ?? likedIds.includes(article.id),
    saved: article.bookmarked_by_user ?? savedIds.includes(article.id),
    viewed: article.viewed_by_user ?? false,
    likedBy,
    viewedBy,
    comments: mergeComments(baseComments, localComments, hiddenComments)
  };
};

// Gere les pages articles, detail, creation, profil public et espace personnel.
function Articles() {
  migrateLegacyInteractionStorage();

  const navigate = useNavigate();
  const location = useLocation();
  const { locale, t } = useLanguage();
  const { id } = useParams();
  const isAddPage = location.pathname === "/articles/add";
  const isMySpacePage = location.pathname === "/my-space";
  const isUserProfilePage = location.pathname.startsWith("/profiles/");

  // Profil courant et indicateur des articles deja vus dans cette session.
  const [profile, setProfile] = useState(() => getProfile());
  const viewedArticleRef = useRef({});

  // Sources principales des posts et donnees de profil.
  const [apiPosts, setApiPosts] = useState([]);
  const [localPosts, setLocalPosts] = useState(loadLocalPosts);
  const [viewedProfileData, setViewedProfileData] = useState(null);
  const [myProfileData, setMyProfileData] = useState(null);
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false);
  const [viewedProfileFetchFailed, setViewedProfileFetchFailed] = useState(false);

  // Donnees du formulaire de creation d'article.
  const [newPost, setNewPost] = useState({
    title: "",
    desc: "",
    file: null,
    mediaSrc: "",
    mediaType: "",
    fileName: "",
    mediaKey: null
  });
  const [newComment, setNewComment] = useState("");

  // Etats lies aux commentaires, reponses et edition de texte.
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyCommentId, setOpenReplyCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [editingReplyKey, setEditingReplyKey] = useState(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [activeReplyActionKey, setActiveReplyActionKey] = useState(null);
  const [showComposerForm, setShowComposerForm] = useState(false);

  // Etats de modification du profil dans l'espace personnel.
  const [isEditingProfileName, setIsEditingProfileName] = useState(false);
  const [isEditingProfileBio, setIsEditingProfileBio] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState(getProfile().userName);
  const [profileBioDraft, setProfileBioDraft] = useState(getProfile().userBio || "");
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);

  // Etats d'affichage des panneaux d'informations du post.
  const [showLikersPanel, setShowLikersPanel] = useState(false);
  const [showViewersPanel, setShowViewersPanel] = useState(false);
  const [showCommentersPanel, setShowCommentersPanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Donnees d'interaction stockees localement.
  const [storedViews, setStoredViews] = useState(loadStoredViews);
  const [articleViewers, setArticleViewers] = useState(() =>
    loadStoredPeople(VIEWERS_STORAGE_KEY)
  );
  const [articleLikers, setArticleLikers] = useState(() =>
    loadStoredPeople(LIKERS_STORAGE_KEY)
  );
  const [profileFollowers, setProfileFollowers] = useState(() =>
    loadStoredPeople(FOLLOWERS_STORAGE_KEY)
  );
  const [profileFollowing, setProfileFollowing] = useState(() =>
    loadStoredPeople(FOLLOWING_STORAGE_KEY)
  );
  const [profilePostViewers, setProfilePostViewers] = useState({});

  // Interactions propres a l'utilisateur connecte.
  const [likedIds, setLikedIds] = useState(() =>
    loadUserIds("liked", profile.userEmail)
  );
  const [savedIds, setSavedIds] = useState(() =>
    loadUserIds("saved", profile.userEmail)
  );
  const [viewedPostIds, setViewedPostIds] = useState(() =>
    loadUserIds("viewed", profile.userEmail)
  );
  const [commentReplies, setCommentReplies] = useState(() =>
    loadJsonStorage(COMMENT_REPLIES_STORAGE_KEY, {})
  );
  const [localCommentsMap, setLocalCommentsMap] = useState(() =>
    loadJsonStorage(LOCAL_COMMENTS_STORAGE_KEY, {})
  );
  const [hiddenComments, setHiddenComments] = useState(() =>
    loadUserIds("hidden_comments", profile.userEmail)
  );
  const [followingIds, setFollowingIds] = useState(() =>
    loadUserIds("following", profile.userEmail)
  );
  const [showProfileAvatarPreview, setShowProfileAvatarPreview] = useState(false);
  const [activeMySpaceTab, setActiveMySpaceTab] = useState("posts");

  // References qui gardent les dernieres valeurs dans les callbacks asynchrones.
  const localPostsRef = useRef(localPosts);
  const likedIdsRef = useRef(likedIds);
  const savedIdsRef = useRef(savedIds);
  const viewedPostIdsRef = useRef(viewedPostIds);
  const storedViewsRef = useRef(storedViews);
  const articleViewersRef = useRef(articleViewers);
  const articleLikersRef = useRef(articleLikers);
  const commentRepliesRef = useRef(commentReplies);
  const localCommentsMapRef = useRef(localCommentsMap);
  const hiddenCommentsRef = useRef(hiddenComments);
  const commentComposerRef = useRef(null);

  // Combine les posts locaux et les posts recuperes par API.
  const posts = useMemo(() => [...localPosts, ...apiPosts], [localPosts, apiPosts]);

  // Identifie le post detaille ou le profil visite selon l'URL.
  const selectedPost = !isUserProfilePage
    ? posts.find((post) => String(post.id) === id)
    : null;
  const viewedProfileFallback = isUserProfilePage
    ? posts.find((post) => String(post.authorId) === String(id))
    : null;
  const viewedProfilePostMatches = isUserProfilePage
    ? posts.filter((post) => String(post.authorId) === String(id))
    : [];

  // Construit un profil de secours a partir des posts si l'API profil echoue.
  const viewedProfileDerivedData = viewedProfileFallback
    ? {
        id: viewedProfileFallback.authorId || Number(id),
        name: viewedProfileFallback.user || "Profile",
        email: viewedProfileFallback.authorEmail || "",
        avatar:
          resolveAvatarUrl(viewedProfileFallback.avatar) ||
          buildAvatar(viewedProfileFallback.user || "Profile"),
        bio: "",
        followers_count: mergePeopleRecords(profileFollowers[String(id)] || []).length,
        following_count: mergePeopleRecords(profileFollowing[String(id)] || []).length,
        posts_count: viewedProfilePostMatches.length,
        likes_count: viewedProfilePostMatches.reduce((sum, post) => sum + (post.likesCount || 0), 0),
        views_count: viewedProfilePostMatches.reduce(
          (sum, post) =>
            sum +
            (post.source === "api"
              ? post.viewsCount || 0
              : Math.max(post.viewsCount || 0, storedViews[String(post.id)] || 0)),
          0
        ),
        is_following: followingIds.includes(Number(id))
      }
    : null;
  const viewedProfileFallbackData =
    viewedProfileFetchFailed && viewedProfileDerivedData ? viewedProfileDerivedData : null;
  const backendViewedProfileData =
    viewedProfileData && String(viewedProfileData.id) === String(id)
      ? viewedProfileData
      : null;
  const activeViewedProfileData = backendViewedProfileData
    ? {
        ...backendViewedProfileData,
        name: backendViewedProfileData.name || viewedProfileDerivedData?.name || "Profile",
        email: backendViewedProfileData.email || viewedProfileDerivedData?.email || "",
        avatar: pickPreferredAvatar(
          backendViewedProfileData.avatar,
          viewedProfileDerivedData?.avatar
        ),
        bio: backendViewedProfileData.bio || viewedProfileDerivedData?.bio || "",
        followers_count: Math.max(
          backendViewedProfileData.followers_count ?? 0,
          viewedProfileDerivedData?.followers_count ?? 0
        ),
        following_count: Math.max(
          backendViewedProfileData.following_count ?? 0,
          viewedProfileDerivedData?.following_count ?? 0
        ),
        posts_count: Math.max(
          backendViewedProfileData.posts_count ?? 0,
          viewedProfileDerivedData?.posts_count ?? 0
        ),
        likes_count: Math.max(
          backendViewedProfileData.likes_count ?? 0,
          viewedProfileDerivedData?.likes_count ?? 0
        ),
        views_count: Math.max(
          backendViewedProfileData.views_count ?? 0,
          viewedProfileDerivedData?.views_count ?? 0
        ),
        is_following:
          backendViewedProfileData.is_following ?? viewedProfileDerivedData?.is_following ?? false,
        role: backendViewedProfileData.role || viewedProfileDerivedData?.role || "",
        username: backendViewedProfileData.username || viewedProfileDerivedData?.username || "",
        created_at:
          backendViewedProfileData.created_at || viewedProfileDerivedData?.created_at || ""
      }
    : viewedProfileFallbackData;
  const hasResolvedViewedProfile = isUserProfilePage && Boolean(activeViewedProfileData);
  const viewedProfileRecord = hasResolvedViewedProfile
    ? normalizePersonRecord(activeViewedProfileData)
    : null;

  // Prepare l'avatar et les informations meta du profil affiche.
  const viewedProfileAvatarSrc =
    pickPreferredAvatar(
      activeViewedProfileData?.avatar,
      viewedProfileRecord?.avatar,
      viewedProfileDerivedData?.avatar
    ) || buildAvatar(activeViewedProfileData?.name || viewedProfileRecord?.name || "User");
  const viewedProfileMeta = [
    { label: t("articles.username"), value: activeViewedProfileData?.username },
    {
      label: t("articles.role"),
      value:
        activeViewedProfileData?.role === "admin"
          ? t("common.admin")
          : activeViewedProfileData?.role
            ? t("common.user")
            : ""
    },
    {
      label: t("articles.joined"),
      value: formatProfileDate(activeViewedProfileData?.created_at, locale)
    },
    { label: t("common.bio"), value: activeViewedProfileData?.bio }
  ].filter((item) => item.value);

  // Donnees de followers, following et viewers pour mon profil ou le profil visite.
  const isFollowingViewedProfile = Boolean(viewedProfileRecord?.id) && (
    activeViewedProfileData?.is_following ?? followingIds.includes(viewedProfileRecord.id)
  );
  const viewedProfileFollowers = viewedProfileRecord?.id
    ? mergePeopleRecords(profileFollowers[String(viewedProfileRecord.id)] || [])
    : [];
  const myFollowers = profile.userId
    ? mergePeopleRecords(profileFollowers[String(profile.userId)] || [])
    : [];
  const myFollowing = profile.userId
    ? mergePeopleRecords(profileFollowing[String(profile.userId)] || [])
    : [];
  const viewedProfileFollowing = viewedProfileRecord?.id
    ? mergePeopleRecords(profileFollowing[String(viewedProfileRecord.id)] || [])
    : [];
  const viewedProfilePostViewers = hasResolvedViewedProfile
    ? mergePeopleRecords(profilePostViewers[String(activeViewedProfileData.id)] || [])
    : [];
  const myFollowersCount = myProfileData?.followers_count ?? myFollowers.length;
  const myFollowingCount = myProfileData?.following_count ?? myFollowing.length;
  const viewedProfileFollowingCount =
    activeViewedProfileData?.following_count ?? viewedProfileFollowing.length;

  // Repertoire des personnes connues pour ameliorer noms et avatars affiches.
  const knownViewedProfilePerson = useMemo(
    () =>
      normalizePersonRecord({
        id: activeViewedProfileData?.id,
        email: activeViewedProfileData?.email,
        name: activeViewedProfileData?.name,
        avatar: activeViewedProfileData?.avatar
      }),
    [
      activeViewedProfileData?.avatar,
      activeViewedProfileData?.email,
      activeViewedProfileData?.id,
      activeViewedProfileData?.name
    ]
  );
  const knownPeopleDirectory = useMemo(() => {
    const directory = new Map();
    const registerPeople = (people = []) => {
      normalizePeopleRecords(people).forEach((person) => {
        directory.set(
          getPersonKey(person),
          mergePersonDirectoryEntries(directory.get(getPersonKey(person)), person)
        );
      });
    };

    registerPeople([
      {
        id: profile.userId,
        email: profile.userEmail,
        name: profile.userName,
        avatar: profile.userAvatar
      },
      knownViewedProfilePerson,
      viewedProfileRecord
    ]);

    posts.forEach((post) => {
      registerPeople([
        {
          id: post.authorId,
          email: post.authorEmail,
          name: post.user,
          avatar: post.avatar
        },
        ...(post.likedBy || []),
        ...(post.viewedBy || [])
      ]);
    });

    [
      articleViewers,
      articleLikers,
      profileFollowers,
      profileFollowing,
      profilePostViewers
    ].forEach((peopleMap) => {
      Object.values(peopleMap || {}).forEach((people) => registerPeople(people));
    });

    return directory;
  }, [
    articleLikers,
    articleViewers,
    knownViewedProfilePerson,
    posts,
    profile.userAvatar,
    profile.userEmail,
    profile.userId,
    profile.userName,
    profileFollowers,
    profileFollowing,
    profilePostViewers,
    viewedProfileRecord
  ]);

  const isPostOwnedByActiveProfile = useCallback(
    (post, activeProfile = profile) => {
      if (!post || !activeProfile) {
        return false;
      }

      if (post.authorId && activeProfile.userId) {
        return Number(post.authorId) === Number(activeProfile.userId);
      }

      if (post.authorEmail && activeProfile.userEmail) {
        return sameUserValue(post.authorEmail, activeProfile.userEmail);
      }

      return post.source === "local" && sameUserValue(post.user, activeProfile.userName);
    },
    [profile]
  );

  const syncPostWithProfile = useCallback(
    (post, activeProfile = profile) =>
      isPostOwnedByActiveProfile(post, activeProfile)
        ? {
            ...post,
            user: activeProfile.userName,
            authorEmail: activeProfile.userEmail,
            avatar: activeProfile.userAvatar
          }
        : post,
    [isPostOwnedByActiveProfile, profile]
  );

  // Persiste les posts locaux et garde leur reference a jour.
  useEffect(() => {
    saveJsonStorage(STORAGE_KEY, serializeLocalPosts(localPosts));
    localPostsRef.current = localPosts;
  }, [localPosts]);

  // Persiste les compteurs de vues locaux.
  useEffect(() => {
    saveJsonStorage(VIEWS_STORAGE_KEY, storedViews);
    storedViewsRef.current = storedViews;
  }, [storedViews]);

  // Persiste les viewers connus par article.
  useEffect(() => {
    saveJsonStorage(VIEWERS_STORAGE_KEY, articleViewers);
    articleViewersRef.current = articleViewers;
  }, [articleViewers]);

  // Persiste les likers connus par article.
  useEffect(() => {
    saveJsonStorage(LIKERS_STORAGE_KEY, articleLikers);
    articleLikersRef.current = articleLikers;
  }, [articleLikers]);

  // Persiste les followers locaux par profil.
  useEffect(() => {
    saveJsonStorage(FOLLOWERS_STORAGE_KEY, profileFollowers);
  }, [profileFollowers]);

  // Persiste les abonnements locaux par profil.
  useEffect(() => {
    saveJsonStorage(FOLLOWING_STORAGE_KEY, profileFollowing);
  }, [profileFollowing]);

  // Persiste les likes propres au compte connecte.
  useEffect(() => {
    saveJsonStorage(userScopedKey("liked", profile.userEmail), likedIds);
    likedIdsRef.current = likedIds;
  }, [likedIds, profile.userEmail]);

  // Persiste les articles sauvegardes par le compte connecte.
  useEffect(() => {
    saveJsonStorage(userScopedKey("saved", profile.userEmail), savedIds);
    savedIdsRef.current = savedIds;
  }, [savedIds, profile.userEmail]);

  // Persiste les articles vus par le compte connecte.
  useEffect(() => {
    saveJsonStorage(userScopedKey("viewed", profile.userEmail), viewedPostIds);
    viewedPostIdsRef.current = viewedPostIds;
  }, [viewedPostIds, profile.userEmail]);

  // Persiste les reponses locales de commentaires.
  useEffect(() => {
    saveJsonStorage(COMMENT_REPLIES_STORAGE_KEY, commentReplies);
    commentRepliesRef.current = commentReplies;
  }, [commentReplies]);

  // Persiste les commentaires locaux.
  useEffect(() => {
    saveJsonStorage(LOCAL_COMMENTS_STORAGE_KEY, localCommentsMap);
    localCommentsMapRef.current = localCommentsMap;
  }, [localCommentsMap]);

  // Persiste les commentaires masques par l'utilisateur.
  useEffect(() => {
    saveJsonStorage(userScopedKey("hidden_comments", profile.userEmail), hiddenComments);
    hiddenCommentsRef.current = hiddenComments;
  }, [hiddenComments, profile.userEmail]);

  // Synchronise le brouillon de bio avec le profil actif.
  useEffect(() => {
    setProfileBioDraft(profile.userBio || "");
  }, [profile.userBio]);

  // Persiste les profils suivis par l'utilisateur.
  useEffect(() => {
    saveJsonStorage(userScopedKey("following", profile.userEmail), followingIds);
  }, [followingIds, profile.userEmail]);

  // Recharge les donnees quand la session change dans un autre onglet ou composant.
  useEffect(() => {
    const syncAuthScopedState = () => {
      const nextProfile = getProfile();

      setProfile(nextProfile);
      setProfileNameDraft(nextProfile.userName);
      setProfileBioDraft(nextProfile.userBio || "");
      setStoredViews(loadStoredViews());
      setArticleViewers(loadStoredPeople(VIEWERS_STORAGE_KEY));
      setArticleLikers(loadStoredPeople(LIKERS_STORAGE_KEY));
      setLikedIds(loadUserIds("liked", nextProfile.userEmail));
      setSavedIds(loadUserIds("saved", nextProfile.userEmail));
      setViewedPostIds(loadUserIds("viewed", nextProfile.userEmail));
      setHiddenComments(loadUserIds("hidden_comments", nextProfile.userEmail));
      setFollowingIds(loadUserIds("following", nextProfile.userEmail));
      viewedArticleRef.current = {};
    };

    const handleWindowRefresh = () => {
      syncAuthScopedState();
    };

    syncAuthScopedState();

    window.addEventListener("storage", syncAuthScopedState);
    window.addEventListener(AUTH_STORAGE_EVENT, syncAuthScopedState);
    window.addEventListener("focus", handleWindowRefresh);
    document.addEventListener("visibilitychange", handleWindowRefresh);

    return () => {
      window.removeEventListener("storage", syncAuthScopedState);
      window.removeEventListener(AUTH_STORAGE_EVENT, syncAuthScopedState);
      window.removeEventListener("focus", handleWindowRefresh);
      document.removeEventListener("visibilitychange", handleWindowRefresh);
    };
  }, []);

  // Deduit les ids suivis depuis les profils suivis stockes.
  useEffect(() => {
    const nextFollowingIds = profile.userId
      ? mergePeopleRecords(profileFollowing[String(profile.userId)] || [])
          .map((person) => person.id)
          .filter(Boolean)
      : [];

    setFollowingIds((current) =>
      JSON.stringify(current) === JSON.stringify(nextFollowingIds) ? current : nextFollowingIds
    );
  }, [profile.userId, profileFollowing]);

  // Reconcile les ids like/view avec les listes de personnes connues.
  useEffect(() => {
    const currentPerson = normalizePersonRecord({
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    });

    if (!currentPerson) {
      return;
    }

    const likedIdsFromPeople = Object.entries(articleLikers)
      .filter(([, likers]) => hasPersonInGroup(likers, currentPerson))
      .map(([postId]) => Number(postId))
      .filter(Number.isFinite);

    const viewedIdsFromPeople = Object.entries(articleViewers)
      .filter(([, viewers]) => hasPersonInGroup(viewers, currentPerson))
      .map(([postId]) => Number(postId))
      .filter(Number.isFinite);

    setLikedIds((current) => {
      const next = Array.from(new Set([...current, ...likedIdsFromPeople]));
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });

    setViewedPostIds((current) => {
      const next = Array.from(new Set([...current, ...viewedIdsFromPeople]));
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [
    articleLikers,
    articleViewers,
    profile.userAvatar,
    profile.userEmail,
    profile.userId,
    profile.userName
  ]);

  // Restaure les medias locaux sauvegardes dans IndexedDB.
  useEffect(() => {
    const hydrateLocalMedia = async () => {
      const hydratedPosts = await Promise.all(
        localPostsRef.current.map(async (post) => {
          let nextPost = post;

          if (!post.mediaSrc && post.mediaKey) {
            const restoredMedia = await getMediaAsset(post.mediaKey);

            if (restoredMedia) {
              nextPost = { ...nextPost, mediaSrc: restoredMedia };
            }
          }

          if (post.authorEmail) {
            const restoredAvatar = await getMediaAsset(getProfileAvatarKey(post.authorEmail));

            if (restoredAvatar) {
              nextPost = { ...nextPost, avatar: restoredAvatar };
            }
          }

          return nextPost;
        })
      );

      setLocalPosts(hydratedPosts);
    };

    hydrateLocalMedia();
  }, [syncPostWithProfile]);

  // Restaure l'avatar du profil courant depuis IndexedDB.
  useEffect(() => {
    const hydrateProfileAvatar = async () => {
      if (!profile.userEmail) {
        return;
      }

      const storedAvatar = await getMediaAsset(getProfileAvatarKey(profile.userEmail));

      if (storedAvatar && storedAvatar !== profile.userAvatar) {
        const nextProfile = {
          ...profile,
          userAvatar: storedAvatar
        };

        setProfile((current) => ({
          ...current,
          userAvatar: storedAvatar
        }));
        setApiPosts((currentPosts) =>
          currentPosts.map((post) => syncPostWithProfile(post, nextProfile))
        );
        setLocalPosts((currentPosts) =>
          currentPosts.map((post) => syncPostWithProfile(post, nextProfile))
        );
      }
    };

    hydrateProfileAvatar();
  }, [profile, profile.userEmail, syncPostWithProfile]);

  // Met a jour l'auteur des posts appartenant au profil courant.
  useEffect(() => {
    const syncOwnedPostIdentity = (currentPosts) =>
      currentPosts.map((post) =>
        isPostOwnedByActiveProfile(post)
          ? {
              ...post,
              user: profile.userName,
              authorId: profile.userId,
              authorEmail: profile.userEmail,
              avatar: profile.userAvatar
            }
          : post
      );

    setApiPosts(syncOwnedPostIdentity);
    setLocalPosts(syncOwnedPostIdentity);
  }, [
    isPostOwnedByActiveProfile,
    profile.userAvatar,
    profile.userEmail,
    profile.userId,
    profile.userName
  ]);

  // Synchronise l'identite du profil courant dans les posts et interactions.
  useEffect(() => {
    if (!profile.userName && !profile.userEmail && !profile.userId) {
      return;
    }

    const currentProfileIdentity = {
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    };

    setApiPosts((currentPosts) => syncProfileInPosts(currentPosts, currentProfileIdentity));
    setLocalPosts((currentPosts) => syncProfileInPosts(currentPosts, currentProfileIdentity));
    setArticleViewers((current) => syncProfileInPeopleMap(current, currentProfileIdentity));
    setArticleLikers((current) => syncProfileInPeopleMap(current, currentProfileIdentity));
    setProfileFollowers((current) => syncProfileInPeopleMap(current, currentProfileIdentity));
    setProfileFollowing((current) => syncProfileInPeopleMap(current, currentProfileIdentity));
    setProfilePostViewers((current) => syncProfileInPeopleMap(current, currentProfileIdentity));
  }, [
    profile.userAvatar,
    profile.userEmail,
    profile.userId,
    profile.userName
  ]);

  // Ferme le formulaire composeur quand on arrive sur la page d'ajout.
  useEffect(() => {
    if (isAddPage) {
      setShowComposerForm(false);
    }
  }, [isAddPage]);

  // Synchronise le brouillon du nom avec le profil courant.
  useEffect(() => {
    setProfileNameDraft(profile.userName);
  }, [profile.userName]);

  // Ferme les panneaux d'insights quand on change d'article.
  useEffect(() => {
    setShowLikersPanel(false);
    setShowViewersPanel(false);
    setShowCommentersPanel(false);
  }, [id]);

  // Charge les viewers du proprietaire pour enrichir le panneau des vues.
  useEffect(() => {
    if (!id || !selectedPost || !isPostOwnedByActiveProfile(selectedPost)) {
      return undefined;
    }

    const ownerId = selectedPost.authorId || profile.userId;

    if (!ownerId) {
      return undefined;
    }

    let cancelled = false;

    const fetchOwnerViewers = async () => {
      try {
        const viewersRes = await api.get(`/profiles/${ownerId}/views`);
        const viewers = normalizePeopleRecords(getProfileViewersResponseData(viewersRes.data));

        if (!cancelled) {
          setProfilePostViewers((current) => ({
            ...current,
            [String(ownerId)]: viewers
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setProfilePostViewers((current) => ({
            ...current,
            [String(ownerId)]: current[String(ownerId)] || []
          }));
        }
      }
    };

    fetchOwnerViewers();

    return () => {
      cancelled = true;
    };
  }, [id, isPostOwnedByActiveProfile, profile.userId, selectedPost]);

  // Charge les statistiques de mon profil sur la page Mon espace.
  useEffect(() => {
    if (!isMySpacePage || !profile.userId) {
      setMyProfileData(null);
      return undefined;
    }

    let cancelled = false;

    const refreshMyProfile = async () => {
      try {
        const [profileRes, viewersRes] = await Promise.all([
          api.get(`/profiles/${profile.userId}`),
          api.get(`/profiles/${profile.userId}/views`)
        ]);
        const data = normalizeProfileResponse(profileRes.data, profile.userId);
        const viewers = normalizePeopleRecords(getProfileViewersResponseData(viewersRes.data));

        if (!cancelled && data) {
          setMyProfileData(data);
          setProfilePostViewers((current) => ({
            ...current,
            [String(profile.userId)]: viewers
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setMyProfileData(null);
          setProfilePostViewers((current) => ({
            ...current,
            [String(profile.userId)]: []
          }));
        }
      }
    };

    const handleWindowFocus = () => {
      refreshMyProfile();
    };

    refreshMyProfile();
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [isMySpacePage, profile.userId]);

  // Charge le profil public visite et ses viewers.
  useEffect(() => {
    const fetchViewedProfile = async () => {
      if (!isUserProfilePage || !id) {
        setViewedProfileData(null);
        setViewedProfileLoading(false);
        setViewedProfileFetchFailed(false);
        return;
      }

      setViewedProfileData(null);
      setViewedProfileLoading(true);
      setViewedProfileFetchFailed(false);

      try {
        const [profileRes, viewersRes] = await Promise.all([
          api.get(`/profiles/${id}`),
          api.get(`/profiles/${id}/views`)
        ]);
        const data = normalizeProfileResponse(profileRes.data, Number(id));
        const viewers = normalizePeopleRecords(getProfileViewersResponseData(viewersRes.data));

        if (!data) {
          setViewedProfileData(null);
          setViewedProfileFetchFailed(true);
          return;
        }

        setViewedProfileData(data);
        setProfilePostViewers((current) => ({
          ...current,
          [String(id)]: viewers
        }));
        setApiPosts((currentPosts) =>
          currentPosts.map((post) =>
            String(post.authorId) === String(data.id)
              ? {
                  ...post,
                  user: data.name,
                  authorEmail: data.email || post.authorEmail,
                  avatar: data.avatar || post.avatar
                }
              : post
          )
        );
        setLocalPosts((currentPosts) =>
          currentPosts.map((post) =>
            String(post.authorId) === String(data.id)
              ? {
                  ...post,
                  user: data.name,
                  authorEmail: data.email || post.authorEmail,
                  avatar: data.avatar || post.avatar
                }
              : post
          )
        );
      } catch (error) {
        setViewedProfileData(null);
        setProfilePostViewers((current) => ({
          ...current,
          [String(id)]: []
        }));
        setViewedProfileFetchFailed(true);
      } finally {
        setViewedProfileLoading(false);
      }
    };

    fetchViewedProfile();
  }, [id, isUserProfilePage]);

  // Charge les articles et les favoris depuis le backend.
  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const [articlesRes, bookmarksRes] = await Promise.all([
          api.get("/articles"),
          api.get("/my-bookmarks")
        ]);
        const backendArticles = articlesRes.data.data || [];
        const backendLikedIds = backendArticles
          .filter((article) => article.liked_by_user)
          .map((article) => article.id);
        const backendViewedIds = backendArticles
          .filter((article) => article.viewed_by_user)
          .map((article) => article.id);

        const backendSavedIds = bookmarksRes.data.map((bookmark) => bookmark.article_id);
        const mergedLikedIds = Array.from(
          new Set([...likedIdsRef.current, ...backendLikedIds])
        );
        const mergedSavedIds = Array.from(
          new Set([...savedIdsRef.current, ...backendSavedIds])
        );
        const mergedViewedIds = Array.from(
          new Set([...viewedPostIdsRef.current, ...backendViewedIds])
        );

        setLikedIds(mergedLikedIds);
        setSavedIds(mergedSavedIds);
        setViewedPostIds(mergedViewedIds);
        const normalizedArticles = backendArticles.map((article) =>
          normalizeArticle(
            article,
            mergedLikedIds,
            mergedSavedIds,
            storedViewsRef.current,
            articleViewersRef.current,
            articleLikersRef.current,
            localCommentsMapRef.current,
            commentRepliesRef.current,
            hiddenCommentsRef.current
          )
        );

        const backendLikersMap = buildPeopleMapFromApiArticles(backendArticles, "likedBy");
        const backendViewersMap = buildPeopleMapFromApiArticles(backendArticles, "viewedBy");

        setArticleLikers((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(backendLikersMap).map(([postId, people]) => [
              postId,
              mergePeopleRecords(current[postId] || [], people)
            ])
          )
        }));
        setArticleViewers((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(backendViewersMap).map(([postId, people]) => [
              postId,
              mergePeopleRecords(current[postId] || [], people)
            ])
          )
        }));
        setApiPosts(normalizedArticles.map((article) => syncPostWithProfile(article)));
      } catch (error) {
        setApiPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [syncPostWithProfile]);

  // Enregistre une vue puis recharge les details complets de l'article ouvert.
  useEffect(() => {
    const fetchArticleDetails = async () => {
      if (!id || !selectedPost) {
        return;
      }

      const postId = String(selectedPost.id);
      const selectedPostId = selectedPost.id;
      const currentViewer = normalizePersonRecord({
        id: profile.userId,
        email: profile.userEmail,
        name: profile.userName,
        avatar: profile.userAvatar
      });
      const alreadyRecordedView =
        viewedPostIdsRef.current.includes(selectedPostId) ||
        hasPersonInGroup(articleViewersRef.current[postId] || [], currentViewer);

      if (!viewedArticleRef.current[postId] && !alreadyRecordedView) {
        viewedArticleRef.current[postId] = true;
        const nextViewedIds = Array.from(new Set([...viewedPostIdsRef.current, selectedPostId]));
        const nextStoredViews = {
          ...storedViewsRef.current,
          [postId]: Math.max(
            storedViewsRef.current[postId] || 0,
            selectedPost.viewsCount || 0
          ) + 1
        };

        viewedPostIdsRef.current = nextViewedIds;
        storedViewsRef.current = nextStoredViews;
        saveJsonStorage(userScopedKey("viewed", profile.userEmail), nextViewedIds);
        saveJsonStorage(VIEWS_STORAGE_KEY, nextStoredViews);
        setViewedPostIds(nextViewedIds);
        setStoredViews(nextStoredViews);

        updatePostById(selectedPostId, (post) => ({
          ...post,
          viewsCount: nextStoredViews[postId],
          viewedBy: mergePeopleRecords(post.viewedBy || [], [currentViewer])
        }));

        const currentViewers = mergePeopleRecords(
          articleViewersRef.current[postId] || [],
          selectedPost.viewedBy || []
        );
        const nextArticleViewers = currentViewers.some(
          (viewer) => getPersonKey(viewer) === getPersonKey(currentViewer)
        )
          ? articleViewersRef.current
          : {
              ...articleViewersRef.current,
              [postId]: [...currentViewers, currentViewer]
            };

        articleViewersRef.current = nextArticleViewers;
        saveJsonStorage(VIEWERS_STORAGE_KEY, nextArticleViewers);
        setArticleViewers(nextArticleViewers);

        if (selectedPost.source === "api") {
          try {
            const viewRes = await api.post(`/articles/${selectedPostId}/view`);
            const syncedViewer = normalizePersonRecord(viewRes.data?.viewer);
            const syncedViewsCount = Number(viewRes.data?.views_count);

            if (Number.isFinite(syncedViewsCount)) {
              const syncedStoredViews = {
                ...storedViewsRef.current,
                [postId]: syncedViewsCount
              };

              storedViewsRef.current = syncedStoredViews;
              saveJsonStorage(VIEWS_STORAGE_KEY, syncedStoredViews);
              setStoredViews(syncedStoredViews);
              updatePostById(selectedPostId, (post) => ({
                ...post,
                viewsCount: syncedStoredViews[postId]
              }));
            }

            if (syncedViewer) {
              setArticleViewers((current) => ({
                ...current,
                [postId]: mergePeopleRecords(current[postId] || [], [syncedViewer])
              }));
            }
          } catch (error) {
            // keep local fallback count even if backend fails
          }
        }
      }

      if (selectedPost.source !== "api") {
        return;
      }

      setDetailLoading(true);

      try {
        const res = await api.get(`/articles/${selectedPostId}`);
        const normalizedArticle = normalizeArticle(
          res.data,
          likedIdsRef.current,
          savedIdsRef.current,
          storedViewsRef.current,
          articleViewersRef.current,
          articleLikersRef.current,
          localCommentsMapRef.current,
          commentRepliesRef.current,
          hiddenCommentsRef.current
        );

        setArticleLikers((current) => ({
          ...current,
          [postId]: mergePeopleRecords(
            current[postId] || [],
            normalizePeopleRecords(res.data?.likes?.map((entry) => entry.user || entry) || [])
          )
        }));
        setArticleViewers((current) => ({
          ...current,
          [postId]: mergePeopleRecords(
            current[postId] || [],
            normalizePeopleRecords(res.data?.views?.map((entry) => entry?.user).filter(Boolean) || [])
          )
        }));
        setApiPosts((currentPosts) =>
          currentPosts.map((post) =>
            post.id === normalizedArticle.id
              ? syncPostWithProfile(normalizedArticle)
              : post
          )
        );
      } catch (error) {
        // keep current UI state
      } finally {
        setDetailLoading(false);
      }
    };

    fetchArticleDetails();
  }, [
    id,
    isPostOwnedByActiveProfile,
    profile.userAvatar,
    profile.userEmail,
    profile.userId,
    profile.userName,
    selectedPost,
    syncPostWithProfile
  ]);

  useEffect(() => {
    const currentPerson = normalizePersonRecord({
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    });
    const isLikedByCurrentProfile = (post) =>
      likedIds.includes(post.id) ||
      hasPersonInGroup(articleLikers[String(post.id)] || [], currentPerson) ||
      hasPersonInGroup(post.likedBy || [], currentPerson);

    setApiPosts((currentPosts) =>
      currentPosts.map((post) => ({
        ...post,
        liked: isLikedByCurrentProfile(post),
        saved: savedIds.includes(post.id),
        viewsCount: post.viewsCount || 0,
        likedBy:
          mergePeopleRecords(post.likedBy || [], articleLikers[String(post.id)] || []),
        viewedBy:
          mergePeopleRecords(post.viewedBy || [], articleViewers[String(post.id)] || []),
        comments: mergeComments(
          (post.comments || []).map((comment) => ({
            ...comment,
            replies: normalizeReplies(
              commentReplies[String(post.id)]?.[String(comment.id)] || comment.replies || []
            )
          })),
          localCommentsMap[String(post.id)] || [],
          hiddenComments
        )
      }))
    );

    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => ({
        ...post,
        liked: isLikedByCurrentProfile(post),
        saved: savedIds.includes(post.id),
        viewsCount: Math.max(post.viewsCount || 0, storedViews[String(post.id)] || 0),
        likedBy:
          mergePeopleRecords(post.likedBy || [], articleLikers[String(post.id)] || []),
        viewedBy:
          mergePeopleRecords(post.viewedBy || [], articleViewers[String(post.id)] || []),
        comments: mergeComments(
          (post.comments || []).map((comment) => ({
            ...comment,
            replies: normalizeReplies(
              commentReplies[String(post.id)]?.[String(comment.id)] || comment.replies || []
            )
          })),
          localCommentsMap[String(post.id)] || [],
          hiddenComments
        )
      }))
    );
  }, [likedIds, savedIds, storedViews, articleViewers, articleLikers, localCommentsMap, commentReplies, hiddenComments, profile.userAvatar, profile.userEmail, profile.userId, profile.userName]);

  const resetForm = () => {
    setNewPost({
      title: "",
      desc: "",
      file: null,
      mediaSrc: "",
      mediaType: "",
      fileName: "",
      mediaKey: null
    });
    setShowComposerForm(false);
  };

  const updatePostById = (postId, updater) => {
    setApiPosts((current) =>
      current.map((post) => (post.id === postId ? updater(post) : post))
    );
    setLocalPosts((current) => {
      const nextPosts = current.map((post) => (post.id === postId ? updater(post) : post));
      localPostsRef.current = nextPosts;
      saveJsonStorage(STORAGE_KEY, serializeLocalPosts(nextPosts));
      return nextPosts;
    });
  };

  const getDisplayViews = (post) => {
    const backendViews = Number(post?.viewsCount || 0);
    const cachedViews = Number(storedViews[String(post?.id)] || 0);
    const baseViews = post?.source === "api"
      ? backendViews
      : Math.max(backendViews, cachedViews);
    const ghostViewerCount = countGhostViewerRecords([
      ...(articleViewers[String(post?.id)] || []),
      ...(post?.viewedBy || []),
      ...getPostPeopleFromCollection(posts, post?.id, "viewedBy")
    ]);

    return Math.max(baseViews - ghostViewerCount, 0);
  };

  // Charge le fichier choisi dans le formulaire de creation.
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const mediaSrc = await readFileAsDataUrl(file);
      setNewPost((current) => ({
        ...current,
        file,
        mediaSrc,
        mediaType: getFileType(file),
        fileName: file.name
      }));
    } finally {
      setIsUploading(false);
    }
  };

  // Cree un nouveau post en local et, si possible, dans le backend.
  const handleAddPost = async (e) => {
    e.preventDefault();

    if (!newPost.title.trim() || !newPost.desc.trim() || !newPost.file) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append("title", newPost.title.trim());
      formData.append("content", newPost.desc.trim());
      formData.append("media", newPost.file);

      const res = await api.post("/articles", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const createdPost = normalizeArticle(
        res.data,
        likedIdsRef.current,
        savedIdsRef.current,
        storedViewsRef.current,
        articleViewersRef.current,
        articleLikersRef.current,
        localCommentsMapRef.current,
        commentRepliesRef.current,
        hiddenCommentsRef.current
      );

      setApiPosts((current) => [createdPost, ...current]);
      resetForm();
      navigate("/articles");
    } catch (error) {
      const postId = Date.now();
      const mediaKey = `post-media-${postId}`;
      await saveMediaAsset(mediaKey, newPost.mediaSrc);

      const post = {
        id: postId,
        source: "local",
        title: newPost.title.trim(),
        desc: newPost.desc.trim(),
        content: newPost.desc.trim(),
        mediaType: newPost.mediaType,
        mediaSrc: newPost.mediaSrc,
        mediaKey,
        fileName: newPost.fileName,
        user: profile.userName,
        authorId: profile.userId,
        authorEmail: profile.userEmail,
        avatar: profile.userAvatar,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        liked: false,
        saved: false,
        likedBy: [],
        viewedBy: [],
        comments: []
      };

      setLocalPosts((current) => [post, ...current]);
      resetForm();
      navigate("/articles");
    }
  };

  // Active ou retire un like sur un post.
  const handleLike = async (postId) => {
    const targetPost = posts.find((post) => post.id === postId);

    if (!targetPost) {
      return;
    }

    const currentUser = normalizePersonRecord({
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    });
    const isCurrentlyLiked =
      likedIds.includes(postId) ||
      targetPost.liked ||
      hasPersonInGroup(articleLikers[String(postId)] || [], currentUser) ||
      hasPersonInGroup(targetPost.likedBy || [], currentUser);
    const willLike = !isCurrentlyLiked;
    const nextLikedIds = willLike
      ? Array.from(new Set([...likedIdsRef.current, postId]))
      : likedIdsRef.current.filter((item) => item !== postId);
    const currentLikers = mergePeopleRecords(
      articleLikersRef.current[String(postId)] || [],
      targetPost.likedBy || []
    );
    const filteredLikers = currentLikers.filter(
      (liker) => getPersonKey(liker) !== getPersonKey(currentUser)
    );
    const nextArticleLikers = {
      ...articleLikersRef.current,
      [String(postId)]: willLike ? [...filteredLikers, currentUser] : filteredLikers
    };
    likedIdsRef.current = nextLikedIds;
    articleLikersRef.current = nextArticleLikers;
    saveJsonStorage(userScopedKey("liked", profile.userEmail), nextLikedIds);
    saveJsonStorage(LIKERS_STORAGE_KEY, nextArticleLikers);
    setLikedIds(nextLikedIds);

    updatePostById(postId, (post) => ({
      ...post,
      liked: willLike,
      likesCount: willLike ? post.likesCount + 1 : Math.max(post.likesCount - 1, 0),
      likedBy: willLike
        ? mergePeopleRecords(post.likedBy || [], [currentUser])
        : (post.likedBy || []).filter(
            (liker) => getPersonKey(liker) !== getPersonKey(currentUser)
          )
    }));
    setArticleLikers(nextArticleLikers);

    if (targetPost.source === "api") {
      try {
        await api.post(`/articles/${postId}/like`);
      } catch (error) {
        const rollbackLikedIds = willLike
          ? likedIdsRef.current.filter((item) => item !== postId)
          : Array.from(new Set([...likedIdsRef.current, postId]));
        const rollbackArticleLikers = {
          ...articleLikersRef.current,
          [String(postId)]: willLike
            ? filteredLikers
            : mergePeopleRecords(filteredLikers, [currentUser])
        };

        likedIdsRef.current = rollbackLikedIds;
        articleLikersRef.current = rollbackArticleLikers;
        saveJsonStorage(userScopedKey("liked", profile.userEmail), rollbackLikedIds);
        saveJsonStorage(LIKERS_STORAGE_KEY, rollbackArticleLikers);
        setLikedIds(rollbackLikedIds);
        setArticleLikers(rollbackArticleLikers);
      }
    }
  };

  // Sauvegarde ou retire un post des favoris.
  const handleBookmark = async (postId) => {
    const targetPost = posts.find((post) => post.id === postId);

    if (!targetPost) {
      return;
    }

    const willSave = !savedIds.includes(postId);
    const nextSavedIds = willSave
      ? Array.from(new Set([...savedIdsRef.current, postId]))
      : savedIdsRef.current.filter((item) => item !== postId);

    savedIdsRef.current = nextSavedIds;
    saveJsonStorage(userScopedKey("saved", profile.userEmail), nextSavedIds);
    setSavedIds(nextSavedIds);

    updatePostById(postId, (post) => ({
      ...post,
      saved: willSave
    }));

    if (targetPost.source === "api") {
      try {
        await api.post(`/articles/${postId}/bookmark`);
      } catch (error) {
        const rollbackSavedIds = willSave
          ? savedIdsRef.current.filter((item) => item !== postId)
          : Array.from(new Set([...savedIdsRef.current, postId]));

        savedIdsRef.current = rollbackSavedIds;
        saveJsonStorage(userScopedKey("saved", profile.userEmail), rollbackSavedIds);
        setSavedIds(rollbackSavedIds);
      }
    }
  };

  // Ajoute un commentaire sur l'article selectionne.
  const handleAddComment = async (e) => {
    e.preventDefault();

    if (!selectedPost || !newComment.trim()) {
      return;
    }

    const commentPayload = {
      id: Date.now(),
      text: newComment.trim(),
      user: profile.userName,
      source: "local",
      replies: []
    };

    if (selectedPost.source === "api") {
      try {
        const res = await api.post("/comments", {
          content: commentPayload.text,
          article_id: selectedPost.id
        });
        const savedComment = {
          id: res.data.id,
          text: res.data.content,
          user: res.data.user?.name || profile.userName,
          source: "api",
          replies: []
        };

        updatePostById(selectedPost.id, (post) => ({
          ...post,
          comments: [...(post.comments || []), savedComment],
          commentsCount: (post.commentsCount || 0) + 1
        }));
        setNewComment("");
        return;
      } catch (error) {
        // fallback to local persistence when backend comment fails
      }
    }

    updatePostById(selectedPost.id, (post) => ({
      ...post,
      comments: [...(post.comments || []), commentPayload],
      commentsCount: (post.commentsCount || 0) + 1
    }));
    setLocalCommentsMap((current) => ({
      ...current,
      [String(selectedPost.id)]: [
        ...(current[String(selectedPost.id)] || []),
        commentPayload
      ]
    }));
    setNewComment("");
  };

  // Ajoute une reponse locale a un commentaire.
  const handleReplySubmit = (commentId) => {
    if (!selectedPost) {
      return;
    }

    const draft = replyDrafts[commentId];

    if (!draft?.trim()) {
      return;
    }

    const reply = {
      id: Date.now(),
      text: draft.trim(),
      user: profile.userName
    };

    setCommentReplies((current) => ({
      ...current,
      [String(selectedPost.id)]: {
        ...(current[String(selectedPost.id)] || {}),
        [String(commentId)]: [
          ...((current[String(selectedPost.id)] || {})[String(commentId)] || []),
          reply
        ]
      }
    }));

    setReplyDrafts((current) => ({
      ...current,
      [commentId]: ""
    }));
    setOpenReplyCommentId(commentId);
  };

  // Supprime ou masque un commentaire.
  const handleDeleteComment = async (commentId) => {
    if (!selectedPost) {
      return;
    }

    const targetComment = (selectedPost.comments || []).find(
      (comment) => comment.id === commentId
    );

    if (!targetComment) {
      return;
    }

    if (selectedPost.source === "api" && targetComment.source === "api") {
      try {
        await api.delete(`/comments/${commentId}`);
      } catch (error) {
        return;
      }
    } else {
      setHiddenComments((current) =>
        current.includes(commentId) ? current : [...current, commentId]
      );
    }

    updatePostById(selectedPost.id, (post) => ({
      ...post,
      comments: (post.comments || []).filter((comment) => comment.id !== commentId),
      commentsCount: Math.max((post.commentsCount || 1) - 1, 0)
    }));
    setLocalCommentsMap((current) => ({
      ...current,
      [String(selectedPost.id)]: (current[String(selectedPost.id)] || []).filter(
        (comment) => comment.id !== commentId
      )
    }));
  };

  // Ouvre le mode edition d'un commentaire.
  const handleEditCommentStart = (comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text || "");
  };

  // Annule l'edition d'un commentaire.
  const handleEditCommentCancel = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  // Enregistre la modification d'un commentaire.
  const handleEditCommentSave = async (commentId) => {
    if (!selectedPost || !editingCommentText.trim()) {
      return;
    }

    const targetComment = (selectedPost.comments || []).find(
      (comment) => comment.id === commentId
    );

    if (!targetComment) {
      return;
    }

    const nextText = editingCommentText.trim();

    if (selectedPost.source === "api" && targetComment.source === "api") {
      try {
        await api.patch(`/comments/${commentId}`, {
          content: nextText
        });
      } catch (error) {
        return;
      }
    }

    updatePostById(selectedPost.id, (post) => ({
      ...post,
      comments: (post.comments || []).map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              text: nextText
            }
          : comment
      )
    }));

    setLocalCommentsMap((current) => ({
      ...current,
      [String(selectedPost.id)]: (current[String(selectedPost.id)] || []).map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              text: nextText
            }
          : comment
      )
    }));

    setEditingCommentId(null);
    setEditingCommentText("");
  };

  // Ouvre le mode edition d'une reponse.
  const handleEditReplyStart = (commentId, reply) => {
    setEditingReplyKey(`${commentId}-${reply.id}`);
    setEditingReplyText(reply.text || "");
  };

  // Annule l'edition d'une reponse.
  const handleEditReplyCancel = () => {
    setEditingReplyKey(null);
    setEditingReplyText("");
  };

  // Enregistre la modification d'une reponse.
  const handleEditReplySave = (commentId, replyId) => {
    if (!selectedPost || !editingReplyText.trim()) {
      return;
    }

    const nextText = editingReplyText.trim();

    setCommentReplies((current) => ({
      ...current,
      [String(selectedPost.id)]: {
        ...(current[String(selectedPost.id)] || {}),
        [String(commentId)]: (((current[String(selectedPost.id)] || {})[String(commentId)] || [])).map(
          (reply) =>
            reply.id === replyId
              ? {
                  ...reply,
                  text: nextText
                }
              : reply
        )
      }
    }));

    setEditingReplyKey(null);
    setEditingReplyText("");
    setActiveReplyActionKey(`${commentId}-${replyId}`);
  };

  // Supprime une reponse de commentaire.
  const handleDeleteReply = (commentId, replyId) => {
    if (!selectedPost) {
      return;
    }

    setCommentReplies((current) => ({
      ...current,
      [String(selectedPost.id)]: {
        ...(current[String(selectedPost.id)] || {}),
        [String(commentId)]: (((current[String(selectedPost.id)] || {})[String(commentId)] || [])).filter(
          (reply) => reply.id !== replyId
        )
      }
    }));

    if (editingReplyKey === `${commentId}-${replyId}`) {
      setEditingReplyKey(null);
      setEditingReplyText("");
    }

    if (activeReplyActionKey === `${commentId}-${replyId}`) {
      setActiveReplyActionKey(null);
    }
  };

  const isOwnedByProfile = (post) => isPostOwnedByActiveProfile(post);

  // Supprime un post localement et dans le backend si necessaire.
  const handleDeletePost = async (postId) => {
    const targetPost = posts.find((post) => post.id === postId);

    if (!targetPost || !isOwnedByProfile(targetPost)) {
      return;
    }

    if (targetPost.source === "api") {
      try {
        await api.delete(`/articles/${postId}`);
      } catch (error) {
        return;
      }
    }

    setApiPosts((current) => current.filter((post) => post.id !== postId));
    setLocalPosts((current) => current.filter((post) => post.id !== postId));
    setLikedIds((current) => current.filter((value) => value !== postId));
    setSavedIds((current) => current.filter((value) => value !== postId));
    setViewedPostIds((current) => current.filter((value) => value !== postId));
    setStoredViews((current) => {
      const next = { ...current };
      delete next[String(postId)];
      return next;
    });
    setArticleViewers((current) => {
      const next = { ...current };
      delete next[String(postId)];
      return next;
    });
    setArticleLikers((current) => {
      const next = { ...current };
      delete next[String(postId)];
      return next;
    });
    setLocalCommentsMap((current) => {
      const next = { ...current };
      delete next[String(postId)];
      return next;
    });

    if (String(id) === String(postId)) {
      navigate("/my-space");
    }
  };

  // Like rapidement un article avec un double clic.
  const handlePostDoubleClickLike = () => {
    if (!selectedPost || selectedPost.liked) {
      return;
    }

    handleLike(selectedPost.id);
  };

  // Change l'avatar du profil courant.
  const handleProfileAvatarChange = async (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    const avatarData = await readFileAsDataUrl(file);
    const avatarKey = getProfileAvatarKey(profile.userEmail);
    await saveMediaAsset(avatarKey, avatarData);

    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.patch("/me", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      const nextAvatar = resolveAvatarUrl(res.data.user?.avatar) || avatarData;

      localStorage.setItem("userAvatar", nextAvatar);
      setProfile((current) => ({
        ...current,
        userAvatar: nextAvatar
      }));
      setApiPosts((current) =>
        current.map((post) => ({
          ...post,
          avatar: isOwnedByProfile(post) ? nextAvatar : post.avatar
        }))
      );
      setLocalPosts((current) =>
        current.map((post) => ({
          ...post,
          avatar: isOwnedByProfile(post) ? nextAvatar : post.avatar
        }))
      );
      setArticleViewers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: nextAvatar
        })
      );
      setArticleLikers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: nextAvatar
        })
      );
      setProfileFollowers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: nextAvatar
        })
      );
      setProfileFollowing((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: nextAvatar
        })
      );
      return;
    } catch (error) {
      localStorage.setItem("userAvatar", avatarData);
      setProfile((current) => ({
        ...current,
        userAvatar: avatarData
      }));
      setApiPosts((current) =>
        current.map((post) => ({
          ...post,
          avatar: isOwnedByProfile(post) ? avatarData : post.avatar
        }))
      );
      setLocalPosts((current) =>
        current.map((post) => ({
          ...post,
          avatar: isOwnedByProfile(post) ? avatarData : post.avatar
        }))
      );
      setArticleViewers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: avatarData
        })
      );
      setArticleLikers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: avatarData
        })
      );
      setProfileFollowers((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: avatarData
        })
      );
      setProfileFollowing((current) =>
        updateStoredPeopleProfile(current, profile.userName, {
          id: profile.userId,
          email: profile.userEmail,
          name: profile.userName,
          avatar: avatarData
        })
      );
    }
  };

  const replaceUserNameInPosts = (postsList, previousName, nextName, nextAvatar) =>
    postsList.map((post) => ({
      ...post,
      user: isOwnedByProfile(post) ? nextName : post.user,
      avatar: isOwnedByProfile(post) ? nextAvatar : post.avatar,
      likedBy: (post.likedBy || []).map((person) =>
        sameUserValue(person?.name, previousName)
          ? { ...normalizePersonRecord(person), name: nextName, avatar: nextAvatar }
          : normalizePersonRecord(person)
      ),
      viewedBy: (post.viewedBy || []).map((person) =>
        sameUserValue(person?.name, previousName)
          ? { ...normalizePersonRecord(person), name: nextName, avatar: nextAvatar }
          : normalizePersonRecord(person)
      ),
      comments: (post.comments || []).map((comment) => ({
        ...comment,
        user: sameUserValue(comment.user, previousName) ? nextName : comment.user,
        replies: (comment.replies || []).map((reply) => ({
          ...reply,
          user: sameUserValue(reply.user, previousName) ? nextName : reply.user
        }))
      }))
    }));

  // Enregistre le nouveau nom du profil.
  const handleProfileNameSave = async () => {
    const trimmedName = profileNameDraft.trim();

    if (!trimmedName || sameUserValue(trimmedName, profile.userName)) {
      setIsEditingProfileName(false);
      setProfileNameDraft(profile.userName);
      return;
    }

    setIsSavingProfileName(true);

    try {
      await api.patch("/me", { name: trimmedName });
    } catch (error) {
      // keep local profile update so the UI stays editable even if backend is unavailable
    }

    const previousName = profile.userName;
    const nextAvatar = profile.userAvatar;

    localStorage.setItem("userName", trimmedName);

    setProfile((current) => ({
      ...current,
      userName: trimmedName,
      userAvatar: nextAvatar
    }));
    setApiPosts((current) =>
      replaceUserNameInPosts(current, previousName, trimmedName, nextAvatar)
    );
    setLocalPosts((current) =>
      replaceUserNameInPosts(current, previousName, trimmedName, nextAvatar)
    );
    setCommentReplies((current) => {
      const next = { ...current };

      Object.keys(next).forEach((articleId) => {
        Object.keys(next[articleId] || {}).forEach((commentId) => {
          next[articleId][commentId] = (next[articleId][commentId] || []).map((reply) => ({
            ...reply,
            user: sameUserValue(reply.user, previousName) ? trimmedName : reply.user
          }));
        });
      });

      return next;
    });
    setLocalCommentsMap((current) => {
      const next = { ...current };

      Object.keys(next).forEach((articleId) => {
        next[articleId] = (next[articleId] || []).map((comment) => ({
          ...comment,
          user: sameUserValue(comment.user, previousName) ? trimmedName : comment.user
        }));
      });

      return next;
    });
    setArticleViewers((current) =>
      updateStoredPeopleProfile(current, previousName, {
        id: profile.userId,
        email: profile.userEmail,
        name: trimmedName,
        avatar: nextAvatar
      })
    );
    setArticleLikers((current) =>
      updateStoredPeopleProfile(current, previousName, {
        id: profile.userId,
        email: profile.userEmail,
        name: trimmedName,
        avatar: nextAvatar
      })
    );
    setProfileFollowers((current) =>
      updateStoredPeopleProfile(current, previousName, {
        id: profile.userId,
        email: profile.userEmail,
        name: trimmedName,
        avatar: nextAvatar
      })
    );
    setProfileFollowing((current) =>
      updateStoredPeopleProfile(current, previousName, {
        id: profile.userId,
        email: profile.userEmail,
        name: trimmedName,
        avatar: nextAvatar
      })
    );
    setIsEditingProfileName(false);
    setIsSavingProfileName(false);
  };

  // Met a jour la bio pendant la saisie.
  const handleProfileBioChange = (event) => {
    const nextBio = event.target.value;

    setProfileBioDraft(nextBio);
    localStorage.setItem(getProfileBioKey(profile.userEmail), nextBio);
    setProfile((current) => ({
      ...current,
      userBio: nextBio
    }));
  };

  // Synchronise la bio quand le champ perd le focus.
  const handleProfileBioBlur = async () => {
    await syncBioWithBackend(profileBioDraft.trim());
    setIsEditingProfileBio(false);
  };

  // Affiche le media d'un post selon son type.
  const renderMedia = (post, className = "post-img") => {
    if (!post.mediaSrc) {
      return <div className={`${className} media-fallback`}>{t("articles.mediaUnavailable")}</div>;
    }

    if (post.mediaType === "video") {
      return (
        <video className={className} controls>
          <source src={post.mediaSrc} />
        </video>
      );
    }

    if (post.mediaType === "pdf") {
      return (
        <div className="pdf-preview">
          <iframe title={post.title} src={post.mediaSrc} className={className} />
          <a href={post.mediaSrc} download={post.fileName || `${post.title}.pdf`}>
            {t("articles.openPdf")}
          </a>
        </div>
      );
    }

    return <img src={post.mediaSrc} alt={post.title} className={className} />;
  };

  // Affiche les personnes d'un panneau likes/vues/commentaires.
  const renderInsightPeople = (people = [], emptyLabel) => {
    if (people.length === 0) {
      return <p className="viewer-empty">{emptyLabel}</p>;
    }

    const currentAccountRecord = normalizePersonRecord({
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    });
    const displayPeople = people.reduce((collection, person) => {
      const normalizedPerson = normalizePersonRecord(person);

      if (
        !normalizedPerson ||
        isGhostViewerRecord(normalizedPerson) ||
        isHiddenPlaceholderAccount(normalizedPerson)
      ) {
        return collection;
      }

      const knownPerson =
        Array.from(knownPeopleDirectory.values()).find((entry) =>
          isSamePersonRecord(entry, normalizedPerson)
        ) || knownPeopleDirectory.get(getPersonKey(normalizedPerson));
      const isCurrentAccount = isSamePersonRecord(normalizedPerson, currentAccountRecord);
      const personWithBestAvatar = {
        ...normalizedPerson,
        avatar: isCurrentAccount
          ? profile.userAvatar
          : pickPreferredAvatar(knownPerson?.avatar, normalizedPerson.avatar) ||
            buildAvatar(normalizedPerson.name)
      };
      const existingIndex = collection.findIndex((entry) =>
        isSamePersonRecord(entry, personWithBestAvatar)
      );

      if (existingIndex >= 0) {
        collection[existingIndex] = mergePersonDirectoryEntries(
          collection[existingIndex],
          personWithBestAvatar
        );
        return collection;
      }

      collection.push(personWithBestAvatar);
      return collection;
    }, []);

    return (
      <div className="viewer-grid">
        {displayPeople.map((personWithBestAvatar) => {
          const profileHandle = personWithBestAvatar.name.toLowerCase().replace(/\s+/g, "_");
          const shouldHideHandle =
            profileHandle === "you" ||
            sameUserValue(personWithBestAvatar.name, profile.userName);
          const shouldHideName =
            normalizeUserKey(personWithBestAvatar.name) === "you" &&
            !personWithBestAvatar.id &&
            !personWithBestAvatar.email;

          return (
            <button
              key={getPersonKey(personWithBestAvatar)}
              type="button"
              className={`viewer-card ${personWithBestAvatar.id ? "viewer-card-clickable" : ""}`}
              disabled={!personWithBestAvatar.id}
              onClick={() =>
                personWithBestAvatar.id && navigate(`/profiles/${personWithBestAvatar.id}`)
              }
            >
              <img
                src={personWithBestAvatar.avatar || buildAvatar(personWithBestAvatar.name)}
                alt={personWithBestAvatar.name}
                className="viewer-avatar"
              />
              <div>
                {!shouldHideName && <strong>{personWithBestAvatar.name}</strong>}
                {!shouldHideHandle && <span>@{profileHandle}</span>}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // Recupere les viewers visibles d'un post.
  const getVisibleViewersForPost = (post) => {
    return mergePeopleRecords(
      articleViewers[String(post?.id)] || [],
      post?.viewedBy || [],
      getPostPeopleFromCollection(posts, post?.id, "viewedBy")
    ).filter((person) => !isGhostViewerRecord(person) && !isHiddenPlaceholderAccount(person));
  };

  // Calcule le compteur de vues visible avec les viewers uniques comme source fiable.
  const getVisibleViewsCountForPost = (post) => {
    const visibleViewersCount = getVisibleViewersForPost(post).length;

    return visibleViewersCount > 0 ? visibleViewersCount : getDisplayViews(post);
  };

  // Recupere l'auteur comme viewer si le compteur l'inclut.
  const getPostOwnerViewer = (post) => {
    if (!post) {
      return null;
    }

    const ownerRecord = normalizePersonRecord({
      id: post.authorId,
      email: post.authorEmail,
      name: post.user,
      avatar: post.avatar
    });
    const currentAccountRecord = normalizePersonRecord({
      id: profile.userId,
      email: profile.userEmail,
      name: profile.userName,
      avatar: profile.userAvatar
    });

    return isSamePersonRecord(ownerRecord, currentAccountRecord)
      ? currentAccountRecord
      : ownerRecord;
  };

  // Aligne la liste des viewers sur le compteur affiche.
  const getCountedViewersForPost = (post) => {
    const viewers = getVisibleViewersForPost(post);
    const targetCount = getVisibleViewsCountForPost(post);
    const ownerId = post?.authorId || profile.userId;
    const knownOwnerViewers = ownerId ? profilePostViewers[String(ownerId)] || [] : [];
    const knownViewers = mergePeopleRecords(viewers, knownOwnerViewers);
    const ownerViewer = getPostOwnerViewer(post);
    const shouldAddOwner =
      ownerViewer &&
      targetCount > knownViewers.length &&
      !hasPersonInGroup(knownViewers, ownerViewer);

    return mergePeopleRecords(
      knownViewers,
      shouldAddOwner ? [ownerViewer] : []
    ).slice(0, targetCount);
  };

  const myPosts = posts.filter((post) => isOwnedByProfile(post));
  const likedPosts = posts.filter((post) => likedIds.includes(post.id));
  const savedPosts = posts.filter((post) => savedIds.includes(post.id));
  const totalMyLikes = myPosts.reduce((sum, post) => sum + (post.likesCount || 0), 0);
  const totalMyViews = myPosts.reduce((sum, post) => sum + getVisibleViewsCountForPost(post), 0);
  const selectedPostKey = String(selectedPost?.id ?? id ?? "");
  const selectedPostStoredLikers = articleLikers[selectedPostKey] || [];
  const selectedPostLikers = mergePeopleRecords(
    selectedPostStoredLikers,
    selectedPost?.likedBy || [],
    getPostPeopleFromCollection(posts, selectedPostKey, "likedBy")
  );
  const selectedPostViewers = getCountedViewersForPost(selectedPost);
  const selectedPostVisibleLikesCount =
    Math.max(selectedPost?.likesCount || 0, selectedPostLikers.length);
  const selectedPostVisibleViewsCount = getVisibleViewsCountForPost(selectedPost);
  const canInspectSelectedPostViews = isOwnedByProfile(selectedPost);
  const selectedPostCommenters = mergePeopleRecords(
    (selectedPost?.comments || [])
      .flatMap((comment) => [
        normalizePersonRecord(comment.user),
        ...(comment.replies || []).map((reply) => normalizePersonRecord(reply.user))
      ])
      .filter((person) => person && !sameUserValue(person.name, profile.userName))
  );
  const userProfilePosts = isUserProfilePage
    ? hasResolvedViewedProfile
      ? posts.filter((post) => String(post.authorId) === String(activeViewedProfileData.id))
      : []
    : [];

  // Rend la page profil public.
  if (isUserProfilePage) {
    if (viewedProfileLoading || !hasResolvedViewedProfile) {
      if (!viewedProfileLoading && !hasResolvedViewedProfile) {
        return (
          <div className="articles-page">
            <div className="my-space-hero">
              <div className="profile-box">
                <div className="my-space-copy">
                  <h1>{t("articles.profileUnavailable")}</h1>
                  <p className="subtitle">{t("articles.profileUnavailableText")}</p>
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="articles-page">
          <div className="my-space-hero">
            <div className="profile-box">
              <div className="my-space-copy">
                <h1>{t("articles.loadingProfile")}</h1>
                <p className="subtitle">{t("articles.loadingProfileText")}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Suit ou ne suit plus le profil visite.
    const handleToggleFollow = async () => {
      if (!viewedProfileRecord?.id || viewedProfileRecord.id === profile.userId) {
        return;
      }

      const shouldFollow = !isFollowingViewedProfile;
      const followerRecord = normalizePersonRecord({
        id: profile.userId,
        email: profile.userEmail,
        name: profile.userName,
        avatar: profile.userAvatar
      });
      const followedRecord = normalizePersonRecord({
        id: viewedProfileRecord.id,
        email: viewedProfileRecord.email,
        name: viewedProfileRecord.name,
        avatar: viewedProfileRecord.avatar
      });

      setFollowingIds((current) =>
        current.includes(viewedProfileRecord.id)
          ? current.filter((followedId) => followedId !== viewedProfileRecord.id)
          : [...new Set([...current, viewedProfileRecord.id])]
      );

      setProfileFollowers((current) => {
        const profileKey = String(viewedProfileRecord.id);
        const currentFollowers = mergePeopleRecords(current[profileKey] || []);
        const nextFollowers = isFollowingViewedProfile
          ? currentFollowers.filter((person) => person.id !== followerRecord.id)
          : mergePeopleRecords(currentFollowers, [followerRecord]);

        return {
          ...current,
          [profileKey]: nextFollowers
        };
      });

      setProfileFollowing((current) => {
        const profileKey = String(profile.userId);
        const currentFollowing = mergePeopleRecords(current[profileKey] || []);
        const nextFollowing = isFollowingViewedProfile
          ? currentFollowing.filter((person) => person.id !== followedRecord.id)
          : mergePeopleRecords(currentFollowing, [followedRecord]);

        return {
          ...current,
          [profileKey]: nextFollowing
        };
      });

      setViewedProfileData((current) =>
        current
          ? {
              ...current,
              is_following: shouldFollow,
              followers_count: Math.max(
                0,
                (current.followers_count ?? viewedProfileFollowers.length) + (shouldFollow ? 1 : -1)
              )
            }
          : current
      );

      const followState = await syncFollowWithBackend(viewedProfileRecord.id, shouldFollow);

      if (followState) {
        setViewedProfileData((current) =>
          current
            ? {
                ...current,
                is_following: Boolean(followState.is_following),
                followers_count:
                  followState.followers_count ?? current.followers_count,
                following_count:
                  followState.following_count ?? current.following_count
              }
            : current
        );
      } else {
        setViewedProfileData((current) =>
          current
            ? {
                ...current,
                is_following: !shouldFollow,
                followers_count: Math.max(
                  0,
                  (current.followers_count ?? viewedProfileFollowers.length) + (shouldFollow ? -1 : 1)
                )
              }
            : current
        );
      }
    };

    return (
      <div className="articles-page">
        <div className="my-space-hero">
          <div className="profile-box">
            <div className="profile-view-stack">
              <button
                type="button"
                className="profile-avatar-button"
                onClick={() => setShowProfileAvatarPreview(true)}
              >
                <img
                  src={viewedProfileAvatarSrc}
                  alt={viewedProfileRecord?.name || t("common.user")}
                  className="my-avatar profile-page-avatar"
                />
              </button>
              {viewedProfileRecord?.id && viewedProfileRecord.id !== profile.userId && (
                <button
                  type="button"
                  className={`profile-follow-btn ${isFollowingViewedProfile ? "is-following" : ""}`}
                  onClick={handleToggleFollow}
                >
                  {isFollowingViewedProfile ? <FaCheck /> : <FaPlus />}
                  {isFollowingViewedProfile ? t("articles.following") : t("articles.follow")}
                </button>
              )}
            </div>
            <div className="my-space-copy">
              <h1>{viewedProfileRecord?.name || t("articles.profileUnavailable")}</h1>
              {Boolean(activeViewedProfileData?.email || viewedProfileRecord?.email) && (
                <p className="profile-email-line">
                  {activeViewedProfileData?.email || viewedProfileRecord?.email}
                </p>
              )}
              <p className="subtitle">{t("articles.browseAuthorPosts")}</p>
              {viewedProfileMeta.length > 0 && (
                <div className="profile-meta-grid">
                  {viewedProfileMeta.map((item) => (
                    <div key={item.label} className="profile-meta-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="my-space-stats">
            <div className="my-stat-card">
              <strong>{activeViewedProfileData?.posts_count ?? userProfilePosts.length}</strong>
              <span>{t("articles.posts")}</span>
            </div>
            <div className="my-stat-card">
              <strong>
                {activeViewedProfileData?.likes_count ??
                  userProfilePosts.reduce((sum, post) => sum + (post.likesCount || 0), 0)}
              </strong>
              <span>{t("articles.likes")}</span>
            </div>
            <div className="my-stat-card">
              <strong>
                {activeViewedProfileData?.views_count ??
                  (viewedProfilePostViewers.length ||
                    userProfilePosts.reduce((sum, post) => sum + getVisibleViewsCountForPost(post), 0))}
              </strong>
              <span>{t("articles.views")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{activeViewedProfileData?.followers_count ?? viewedProfileFollowers.length}</strong>
              <span>{t("articles.followers")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{viewedProfileFollowingCount}</strong>
              <span>{t("articles.followingLabel")}</span>
            </div>
          </div>
        </div>

        <div className="grid">
          {userProfilePosts.map((post) => (
            <ArticleCard
              key={`${post.source}-${post.id}`}
              id={post.id}
              authorId={post.authorId}
              title={post.title}
              desc={post.desc}
              user={post.user}
              avatar={post.avatar}
              mediaType={post.mediaType}
              mediaSrc={post.mediaSrc}
              showMedia={post.source === "api"}
              likesCount={post.likesCount}
              commentsCount={post.commentsCount}
              viewsCount={getVisibleViewsCountForPost(post)}
              liked={post.liked}
              saved={post.saved}
              onToggleLike={handleLike}
              onToggleBookmark={handleBookmark}
            />
          ))}
        </div>

        {showProfileAvatarPreview && (
          <div className="profile-avatar-overlay" onClick={() => setShowProfileAvatarPreview(false)}>
            <div className="profile-avatar-dialog" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="back-btn profile-avatar-close"
                onClick={() => setShowProfileAvatarPreview(false)}
              >
                {t("common.close")}
              </button>
              <img
                src={viewedProfileAvatarSrc}
                alt={viewedProfileRecord?.name || t("common.user")}
                className="profile-avatar-preview"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Rend la page detail d'un article.
  if (id) {
    if (!selectedPost && !detailLoading) {
      return (
        <div className="post-page">
          <div className="post-card-big">
            <div className="post-content">
              <h2>{t("articles.articleNotFound")}</h2>
              <p>{t("articles.articleNotFoundText")}</p>
              <button className="read-btn" onClick={() => navigate("/articles")}>
                {t("articles.backToArticles")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!selectedPost) {
      return (
        <div className="post-page">
          <div className="post-card-big">
            <div className="post-content">
              <p>{t("articles.loadingArticle")}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="post-page">
        <div className="post-card-big">
          <div className="post-header detail-header">
            <div className="profile-box">
              <button
                type="button"
                className="card-user-trigger"
                onClick={() => selectedPost.authorId && navigate(`/profiles/${selectedPost.authorId}`)}
              >
                <img
                  src={selectedPost.avatar || buildAvatar(selectedPost.user)}
                  alt={selectedPost.user}
                  className="detail-avatar"
                />
              </button>
              <button
                type="button"
                className="card-user-trigger card-user-meta"
                onClick={() => selectedPost.authorId && navigate(`/profiles/${selectedPost.authorId}`)}
              >
                <div>
                <h4>{selectedPost.user}</h4>
                <small>@{selectedPost.user.toLowerCase().replace(/\s+/g, "_")}</small>
                </div>
              </button>
            </div>

            <button type="button" className="back-btn" onClick={() => navigate("/articles")}>
              {t("common.back")}
            </button>
          </div>

          <div onDoubleClick={handlePostDoubleClickLike}>
            {renderMedia(selectedPost, "post-img")}
          </div>

          <div className="post-content">
            <h2>{selectedPost.title}</h2>
            <p>{selectedPost.content || selectedPost.desc}</p>
          </div>

          <div className="post-actions">
            <button
              type="button"
              className={`post-action-btn ${selectedPost.liked ? "is-liked" : ""}`}
              onClick={() => handleLike(selectedPost.id)}
            >
              {selectedPost.liked ? (
                <FaHeart className="icon liked" />
              ) : (
                <FaRegHeart className="icon" />
              )}
              <small>{t("articles.like")}</small>
              <strong>{selectedPostVisibleLikesCount}</strong>
            </button>

            <div className="post-action-btn">
              <FaComment className="icon" />
              <small>{t("articles.comment")}</small>
              <strong>{selectedPost.commentsCount || 0}</strong>
            </div>

            <button
              type="button"
              className={`post-action-btn ${selectedPost.saved ? "is-saved" : ""}`}
              onClick={() => handleBookmark(selectedPost.id)}
            >
              {selectedPost.saved ? (
                <FaBookmark className="icon saved" />
              ) : (
                <FaRegBookmark className="icon" />
              )}
              <small>{selectedPost.saved ? t("articleCard.saved") : t("articleCard.save")}</small>
            </button>

            <button
              type="button"
              className="post-action-btn"
              onClick={() => {
                if (!canInspectSelectedPostViews) {
                  return;
                }

                setShowViewersPanel((current) => !current);
              }}
            >
              <FaEye className="icon" />
              <small>{t("articles.view")}</small>
              <strong>{selectedPostVisibleViewsCount}</strong>
            </button>
          </div>

          {canInspectSelectedPostViews && (
            <div className="post-owner-tools">
              <button
                type="button"
                className="owner-tool-btn"
                onClick={() => setShowLikersPanel((current) => !current)}
              >
                {showLikersPanel ? t("articles.hideLikes") : t("articles.showLikes")}
              </button>
              <button
                type="button"
                className="owner-tool-btn"
                onClick={() => setShowViewersPanel((current) => !current)}
              >
                {showViewersPanel ? t("articles.hideViewers") : t("articles.showViewers")}
              </button>
              {/* <button
                type="button"
                className="owner-tool-btn"
                onClick={() => setShowCommentersPanel((current) => !current)}
              >
                {showCommentersPanel ? "Hide comments" : "Show comments"}
              </button> */}
              <button
                type="button"
                className="owner-tool-btn owner-delete-btn"
                onClick={() => handleDeletePost(selectedPost.id)}
              >
                {t("articles.deletePost")}
              </button>
            </div>
          )}

          {((canInspectSelectedPostViews &&
            (selectedPostLikers.length > 0 ||
              showLikersPanel ||
              selectedPostViewers.length > 0 ||
              showViewersPanel ||
              selectedPostCommenters.length > 0 ||
              showCommentersPanel)) ||
            (canInspectSelectedPostViews && showViewersPanel && selectedPostViewers.length > 0)) && (
              <div className="post-insights">
                {canInspectSelectedPostViews && showLikersPanel && (
                  <div className="viewer-panel">
                    <div className="viewer-panel-head">
                      <div>
                        <span className="insight-label">{t("articles.likes")}</span>
                        <h3>{t("articles.peopleWhoLiked")}</h3>
                        <p className="viewer-summary">
                          {t("articles.likesSummary")}
                        </p>
                      </div>
                      <strong>{selectedPostLikers.length || 0}</strong>
                    </div>

                    {renderInsightPeople(selectedPostLikers, t("articles.noLikesYet"))}
                  </div>
                )}

                {canInspectSelectedPostViews && showViewersPanel && (
                  <div className="viewer-panel">
                    <div className="viewer-panel-head">
                      <div>
                        <span className="insight-label">{t("articles.views")}</span>
                        <h3>{t("articles.peopleWhoViewed")}</h3>
                        <p className="viewer-summary">
                          {t("articles.viewsSummary")}
                        </p>
                      </div>
                      <strong>{selectedPostViewers.length || 0}</strong>
                    </div>

                    {renderInsightPeople(selectedPostViewers, t("articles.noViewersYet"))}
                  </div>
                )}

                {canInspectSelectedPostViews && showCommentersPanel && (
                  <div className="viewer-panel">
                    <div className="viewer-panel-head">
                      <div>
                        <span className="insight-label">{t("articles.comment")}</span>
                        <h3>{t("articles.peopleWhoCommented")}</h3>
                        <p className="viewer-summary">
                          {t("articles.commentsSummary")}
                        </p>
                      </div>
                      <strong>{selectedPostCommenters.length || 0}</strong>
                    </div>

                    {renderInsightPeople(selectedPostCommenters, t("articles.noCommentsYet"))}
                  </div>
                )}
              </div>
            )}

          <div ref={commentComposerRef} className="comment-composer-wrap">
            <form className="comment-form" onSubmit={handleAddComment}>
              <input
                type="text"
                placeholder={t("articles.writeComment")}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit">{t("common.add")}</button>
            </form>
          </div>

          <div className="comments">
            {(selectedPost.comments || []).map((comment) => (
              <div key={comment.id} className="comment-block">
                <button
                  type="button"
                  className="comment-toggle"
                  onClick={() =>
                    setOpenReplyCommentId((current) =>
                      current === comment.id ? null : comment.id
                    )
                  }
                >
                  <span className="comment">
                    <strong>{comment.user}:</strong>{" "}
                    {editingCommentId === comment.id ? editingCommentText : comment.text}
                  </span>
                </button>

                {sameUserValue(comment.user, profile.userName) &&
                  openReplyCommentId === comment.id && (
                  <>
                    {editingCommentId === comment.id ? (
                      <div className="comment-edit-box">
                        <input
                          type="text"
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          placeholder={t("articles.editComment")}
                        />
                        <button
                          type="button"
                          className="owner-tool-btn"
                          onClick={() => handleEditCommentSave(comment.id)}
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          className="back-btn"
                          onClick={handleEditCommentCancel}
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="comment-owner-actions">
                        <button
                          type="button"
                          className="owner-tool-btn"
                          onClick={() => handleEditCommentStart(comment)}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className="delete-comment-btn"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {openReplyCommentId === comment.id && (
                  <>
                    {(comment.replies || []).map((reply) => (
                      <div key={reply.id} className="reply-thread">
                        <button
                          type="button"
                          className="reply-toggle"
                          onClick={() =>
                            setActiveReplyActionKey((current) =>
                              current === `${comment.id}-${reply.id}`
                                ? null
                                : `${comment.id}-${reply.id}`
                            )
                          }
                        >
                          <span className="comment reply-comment">
                            <strong>{reply.user}:</strong>{" "}
                            {editingReplyKey === `${comment.id}-${reply.id}`
                              ? editingReplyText
                              : reply.text}
                          </span>
                        </button>

                        {sameUserValue(reply.user, profile.userName) &&
                          (activeReplyActionKey === `${comment.id}-${reply.id}` ||
                            editingReplyKey === `${comment.id}-${reply.id}`) && (
                          <>
                            {editingReplyKey === `${comment.id}-${reply.id}` ? (
                              <div className="reply-edit-box">
                                <input
                                  type="text"
                                  value={editingReplyText}
                                  onChange={(e) => setEditingReplyText(e.target.value)}
                                  placeholder={t("articles.editReply")}
                                />
                                <button
                                  type="button"
                                  className="owner-tool-btn"
                                  onClick={() => handleEditReplySave(comment.id, reply.id)}
                                >
                                  {t("common.save")}
                                </button>
                                <button
                                  type="button"
                                  className="back-btn"
                                  onClick={handleEditReplyCancel}
                                >
                                  {t("common.cancel")}
                                </button>
                              </div>
                            ) : (
                              <div className="reply-owner-actions">
                                <button
                                  type="button"
                                  className="owner-tool-btn"
                                  onClick={() => handleEditReplyStart(comment.id, reply)}
                                >
                                  {t("common.edit")}
                                </button>
                                <button
                                  type="button"
                                  className="delete-comment-btn"
                                  onClick={() => handleDeleteReply(comment.id, reply.id)}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    <div className="reply-box">
                      <input
                        type="text"
                        placeholder={t("articles.replyToComment")}
                        value={replyDrafts[comment.id] || ""}
                        onChange={(e) =>
                          setReplyDrafts((current) => ({
                            ...current,
                            [comment.id]: e.target.value
                          }))
                        }
                      />
                      <button type="button" onClick={() => handleReplySubmit(comment.id)}>
                        <FaReply />
                        {t("common.reply")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Rend l'espace personnel du compte connecte.
  if (isMySpacePage) {
    const activePosts =
      activeMySpaceTab === "posts"
        ? myPosts
        : activeMySpaceTab === "likes"
          ? likedPosts
          : savedPosts;

    return (
      <div className="articles-page">
        <div className="my-space-hero">
          <label className="my-avatar-wrap">
            <img src={profile.userAvatar} alt={profile.userName} className="my-avatar" />
            <input type="file" accept="image/*" onChange={handleProfileAvatarChange} />
          </label>

          <div className="my-space-copy">
            {isEditingProfileName ? (
              <div className="profile-name-editor">
                <input
                  type="text"
                  value={profileNameDraft}
                  onChange={(e) => setProfileNameDraft(e.target.value)}
                  placeholder={t("articles.yourName")}
                />
                <div className="profile-name-actions">
                  <button
                    type="button"
                    className="owner-tool-btn"
                    onClick={handleProfileNameSave}
                    disabled={isSavingProfileName}
                  >
                    {isSavingProfileName ? t("common.saving") : t("common.save")}
                  </button>
                  <button
                    type="button"
                    className="back-btn"
                    onClick={() => {
                      setIsEditingProfileName(false);
                      setProfileNameDraft(profile.userName);
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="profile-name-trigger"
                onClick={() => setIsEditingProfileName(true)}
              >
                <h1>{profile.userName}</h1>
                <span>{t("articles.tapToChangeName")}</span>
              </button>
            )}
            {isEditingProfileBio ? (
              <textarea
                className="profile-bio-input"
                rows={3}
                value={profileBioDraft}
                onChange={handleProfileBioChange}
                onBlur={handleProfileBioBlur}
                placeholder={t("articles.shortBio")}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="profile-bio-trigger"
                onClick={() => setIsEditingProfileBio(true)}
              >
                {profile.userBio?.trim() || t("common.bio")}
              </button>
            )}
          </div>

          <div className="my-space-stats">
            <div className="my-stat-card">
              <strong>{myPosts.length}</strong>
              <span>{t("articles.posts")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{totalMyLikes}</strong>
              <span>{t("articles.likes")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{totalMyViews}</strong>
              <span>{t("articles.views")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{myFollowersCount}</strong>
              <span>{t("articles.followers")}</span>
            </div>
            <div className="my-stat-card">
              <strong>{myFollowingCount}</strong>
              <span>{t("articles.followingLabel")}</span>
            </div>
          </div>
        </div>

        <div className="my-space-tabs">
          <button
            className={activeMySpaceTab === "posts" ? "active-tab" : ""}
            onClick={() => setActiveMySpaceTab("posts")}
          >
            {t("articles.myPosts")}
          </button>
          <button
            className={activeMySpaceTab === "likes" ? "active-tab" : ""}
            onClick={() => setActiveMySpaceTab("likes")}
          >
            {t("articles.myLikes")}
          </button>
          <button
            className={activeMySpaceTab === "saved" ? "active-tab" : ""}
            onClick={() => setActiveMySpaceTab("saved")}
          >
            {t("articles.mySaves")}
          </button>
        </div>

        <div className="grid">
          {activePosts.map((post) => (
            <div key={`${post.source}-${post.id}`} className="my-space-card-wrap">
              <ArticleCard
                id={post.id}
                authorId={post.authorId}
                title={post.title}
                desc={post.desc}
                user={post.user}
                avatar={post.avatar}
                mediaType={post.mediaType}
                mediaSrc={post.mediaSrc}
                showMedia={post.source === "api"}
                likesCount={post.likesCount}
                commentsCount={post.commentsCount}
                viewsCount={getVisibleViewsCountForPost(post)}
                liked={post.liked}
                saved={post.saved}
                onToggleLike={handleLike}
                onToggleBookmark={handleBookmark}
              />

              {isOwnedByProfile(post) && (
                <button
                  type="button"
                  className="delete-post-btn"
                  onClick={() => handleDeletePost(post.id)}
                >
                  {t("articles.deletePost")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Rend la page de creation d'article.
  if (isAddPage) {
    return (
      <div className="articles-page add-post-page">
        <div className="articles-hero add-post-hero">
          <div>
            <h1>{t("articles.createArticle")}</h1>
            <p className="subtitle">
              {t("articles.createArticleText")}
            </p>
          </div>
        </div>

        <div className="compose-entry compose-entry-static add-post-entry">
          <button
            type="button"
            className="compose-entry-trigger"
            onClick={() => setShowComposerForm(true)}
          >
            <div className="profile-box">
              <img
                src={profile.userAvatar}
                alt={profile.userName}
                className="detail-avatar"
              />
              <div>
                <h3>{t("articles.newPost")}</h3>
                <p>{t("articles.openEditorText")}</p>
              </div>
            </div>

            <div className="compose-badge">
              <FaPlus /> {t("articles.openEditor")}
            </div>
          </button>
        </div>

        {showComposerForm && (
          <div className="composer-page">
            <form className="add-post add-post-modal" onSubmit={handleAddPost}>
              <div className="add-post-shell">
                <div className="form-intro add-post-intro">
                  <span className="form-kicker">{t("articles.uploadPost")}</span>
                  <h2>{t("articles.uploadArticle")}</h2>
                  <p>{t("articles.uploadArticleText")}</p>
                </div>

                <div className="add-post-fields-row">
                  <label className="field-group neon-field">
                    <span className="field-icon">
                      <FaFont />
                    </span>
                    <div className="field-stack">
                      <span className="field-label sr-only">{t("articles.title")}</span>
                      <input
                        type="text"
                        placeholder={t("articles.articleTitle")}
                        value={newPost.title}
                        onChange={(e) =>
                          setNewPost((current) => ({ ...current, title: e.target.value }))
                        }
                      />
                    </div>
                  </label>

                  <label className="field-group neon-field neon-field-area">
                    <span className="field-icon">
                      <FaAlignLeft />
                    </span>
                    <div className="field-stack">
                      <span className="field-label sr-only">{t("articles.description")}</span>
                      <textarea
                        placeholder={t("articles.description")}
                        value={newPost.desc}
                        onChange={(e) =>
                          setNewPost((current) => ({ ...current, desc: e.target.value }))
                        }
                      />
                    </div>
                  </label>
                </div>

                <label className="upload-box neon-upload-box">
                  <span className="field-icon upload-icon">
                    <FaFileUpload />
                  </span>
                  <strong>{t("articles.uploadMedia")}</strong>
                  <input
                    className="upload-input-hidden"
                    type="file"
                    accept="image/*,video/*,.pdf,application/pdf"
                    onChange={handleFileChange}
                  />
                </label>

                {isUploading && <p className="upload-hint">{t("articles.uploadingFile")}</p>}
                {newPost.fileName && (
                  <p className="upload-hint">{t("articles.selectedFile")} {newPost.fileName}</p>
                )}

                {newPost.mediaSrc && (
                  <div className="composer-preview neon-preview">
                    {renderMedia(
                      {
                        ...newPost,
                        title: newPost.title || t("articles.preview"),
                        mediaSrc: newPost.mediaSrc
                      },
                      "composer-media"
                    )}
                  </div>
                )}

                <div className="composer-actions add-post-actions">
                  <button type="button" className="back-btn add-post-cancel" onClick={resetForm}>
                    {t("common.cancel")}
                  </button>

                  <button className="publish-btn add-post-publish" disabled={isUploading}>
                    {t("articles.publish")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="articles-page">
      <div className="articles-hero">
        <div>
          <h1>Articles</h1>
        </div>
      </div>

      <div className="section-head">
        <h2>{t("articles.latestArticles")}</h2>
        <p>{loading ? t("articles.loadingArticles") : t("articles.articlesSummary")}</p>
      </div>

      <div className="grid">
        {posts.map((post) => (
          <ArticleCard
            key={`${post.source}-${post.id}`}
            id={post.id}
            authorId={post.authorId}
            title={post.title}
            desc={post.desc}
            user={post.user}
            avatar={post.avatar}
            mediaType={post.mediaType}
            mediaSrc={post.mediaSrc}
            showMedia={post.source === "api"}
            likesCount={post.likesCount}
            commentsCount={post.commentsCount}
            viewsCount={getVisibleViewsCountForPost(post)}
            liked={post.liked}
            saved={post.saved}
            onToggleLike={handleLike}
            onToggleBookmark={handleBookmark}
          />
        ))}
      </div>
    </div>
  );
}

export default Articles;
