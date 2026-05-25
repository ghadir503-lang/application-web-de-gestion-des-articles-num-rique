const DB_NAME = "magazine_media_db";
const STORE_NAME = "media";

// Ouvre la base IndexedDB utilisee pour conserver les medias locaux.
const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// Enregistre un media local dans IndexedDB avec une cle stable.
export const saveMediaAsset = async (key, value) => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve(key);
    request.onerror = () => reject(request.error);
  });
};

// Recupere un media local depuis IndexedDB.
export const getMediaAsset = async (key) => {
  if (!key) {
    return null;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};
