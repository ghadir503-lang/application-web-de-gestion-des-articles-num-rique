import { useLanguage } from "../context/LanguageContext";

// Affiche le pied de page traduit.
function Footer() {
  const { t } = useLanguage();

  return (
    <footer style={{ textAlign: "center", padding: "20px" }}>
      <p>{t("footer.copyright")}</p>
    </footer>
  );
}

export default Footer;
