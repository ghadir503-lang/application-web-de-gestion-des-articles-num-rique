import {
  FaHeart,
  FaRegHeart,
  FaComment,
  FaBookmark,
  FaRegBookmark,
  FaEye
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { buildAvatar, resolveAvatarUrl } from "../utils/avatar";
import { useLanguage } from "../context/LanguageContext";

// Affiche une carte resume d'article avec media, auteur et compteurs.
function ArticleCard({
  id,
  authorId,
  title,
  desc,
  user,
  avatar,
  mediaType,
  mediaSrc,
  showMedia = true,
  likesCount = 0,
  commentsCount = 0,
  viewsCount = 0,
  liked = false,
  saved = false,
  onToggleLike,
  onToggleBookmark
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const avatarSrc = resolveAvatarUrl(avatar) || buildAvatar(user);

  return (
    <div className="card article-card">
      {/* Zone auteur avec navigation vers le profil. */}
      <div className="card-user">
        <button
          type="button"
          className="card-user-trigger"
          onClick={() => authorId && navigate(`/profiles/${authorId}`)}
        >
          <img src={avatarSrc} alt={user} className="card-avatar" />
        </button>
        <button
          type="button"
          className="card-user-trigger card-user-meta"
          onClick={() => authorId && navigate(`/profiles/${authorId}`)}
        >
          <div>
          <h4>{user}</h4>
          <small>{t("articleCard.author")}</small>
          </div>
        </button>
      </div>

      {/* Apercu image ou video de l'article. */}
      {showMedia && mediaSrc && mediaType !== "pdf" && (
        <div className="card-media-wrap">
          {mediaType === "video" ? (
            <video className="card-media" muted>
              <source src={mediaSrc} />
            </video>
          ) : (
            <img src={mediaSrc} alt={title} className="card-media" />
          )}
        </div>
      )}

      {/* Indique qu'un article est un PDF quand il n'a pas d'apercu image. */}
      {showMedia && mediaType === "pdf" && <div className="card-pdf">{t("articleCard.pdfArticle")}</div>}

      {/* Titre et extrait de l'article. */}
      <h3>{title}</h3>
      <p>{desc}</p>

      {/* Actions rapides: like, commentaire, sauvegarde et vues. */}
      <div className="card-actions">
        <button
          type="button"
          className="card-action-btn"
          onClick={() => onToggleLike?.(id)}
        >
          {liked ? <FaHeart className="liked" /> : <FaRegHeart />}
          <span>{likesCount}</span>
        </button>

        <button
          type="button"
          className="card-action-btn"
          onClick={() => navigate(`/articles/${id}`)}
        >
          <FaComment />
          <span>{commentsCount}</span>
        </button>

        <button
          type="button"
          className="card-action-btn"
          onClick={() => onToggleBookmark?.(id)}
        >
          {saved ? <FaBookmark className="saved" /> : <FaRegBookmark />}
          <span>{saved ? t("articleCard.saved") : t("articleCard.save")}</span>
        </button>

        <div className="card-action-btn card-action-static">
          <FaEye />
          <span>{viewsCount}</span>
        </div>
      </div>

      {/* Ouvre la page detaillee de l'article. */}
      <button type="button" className="read-btn" onClick={() => navigate(`/articles/${id}`)}>
        {t("articleCard.readMore")}
      </button>
    </div>
  );
}

export default ArticleCard;
