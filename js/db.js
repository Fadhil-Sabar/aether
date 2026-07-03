/**
 * Aether IndexedDB Storage Layer
 * 
 * Provides async storage for chat data with localStorage fallback.
 * Keeps small settings (theme, toggles) in localStorage for sync access.
 */
(function (window) {
  "use strict";

  const DB_NAME = "aether";
  const DB_VERSION = 1;
  const STORE_NAME = "chats";
  const SETTINGS_STORE = "settings";

  let _db = null;
  let _ready = false;
  let _readyCallbacks = [];

  /**
   * Open IndexedDB connection.
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not available"));
        return;
      }
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (e) {
        var db = e.target.result;
        // Chats object store — keyed by chat.id
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
        // Settings object store — keyed by key name
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = function (e) {
        _db = e.target.result;

        // Handle versionchange (another tab updated DB)
        _db.onversionchange = function () {
          _db.close();
          _db = null;
          _ready = false;
        };

        resolve(_db);
      };

      request.onerror = function (e) {
        reject(new Error("IndexedDB error: " + e.target.error));
      };

      request.onblocked = function () {
        reject(new Error("IndexedDB blocked — another tab has an older version open"));
      };
    });
  }

  // ── Chat Operations ─────────────────────────────────

  function getAllChats() {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readonly");
      var store = tx.objectStore(STORE_NAME);
      var request = store.getAll();

      request.onsuccess = function () {
        resolve(request.result || []);
      };
      request.onerror = function () {
        reject(new Error("Failed to load chats"));
      };
    });
  }

  function getChat(chatId) {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readonly");
      var store = tx.objectStore(STORE_NAME);
      var request = store.get(chatId);

      request.onsuccess = function () {
        resolve(request.result || null);
      };
      request.onerror = function () {
        reject(new Error("Failed to load chat: " + chatId));
      };
    });
  }

  function saveChat(chat) {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readwrite");
      var store = tx.objectStore(STORE_NAME);
      var request = store.put(chat);

      request.onsuccess = function () {
        resolve();
      };
      request.onerror = function () {
        reject(new Error("Failed to save chat: " + chat.id));
      };
    });
  }

  function saveAllChats(chats) {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readwrite");
      var store = tx.objectStore(STORE_NAME);

      // Clear existing, then add all
      var clearReq = store.clear();
      clearReq.onsuccess = function () {
        var added = 0;
        if (chats.length === 0) {
          resolve();
          return;
        }
        chats.forEach(function (chat) {
          var req = store.put(chat);
          req.onsuccess = function () {
            added++;
            if (added >= chats.length) resolve();
          };
          req.onerror = function () {
            reject(new Error("Failed to save chat: " + chat.id));
          };
        });
      };
      clearReq.onerror = function () {
        reject(new Error("Failed to clear chats"));
      };
    });
  }

  /**
   * Add multiple chats without clearing existing data.
   * Uses individual puts — existing chats with the same id get updated.
   * Perfect for imports and batch additions.
   */
  function batchAddChats(chats) {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      if (!chats || chats.length === 0) return resolve(0);
      var tx = _db.transaction(STORE_NAME, "readwrite");
      var store = tx.objectStore(STORE_NAME);
      var added = 0;

      chats.forEach(function (chat) {
        var req = store.put(chat);
        req.onsuccess = function () {
          added++;
          if (added >= chats.length) resolve(added);
        };
        req.onerror = function () {
          reject(new Error("Failed to add chat: " + chat.id));
        };
      });
    });
  }

  function deleteChat(chatId) {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readwrite");
      var store = tx.objectStore(STORE_NAME);
      var request = store.delete(chatId);

      request.onsuccess = function () {
        resolve();
      };
      request.onerror = function () {
        reject(new Error("Failed to delete chat: " + chatId));
      };
    });
  }

  function getChatCount() {
    return new Promise(function (resolve, reject) {
      if (!_db) return reject(new Error("DB not open"));
      var tx = _db.transaction(STORE_NAME, "readonly");
      var store = tx.objectStore(STORE_NAME);
      var request = store.count();

      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(new Error("Failed to count chats"));
      };
    });
  }

  // ── Settings operations (for chat-related keys that need async) ──
  // Small settings still use localStorage — this is only for larger data

  // ── Initialization ───────────────────────────────────

  /**
   * Initialize the database.
   * Call once on app boot. Returns a promise that resolves when ready.
   */
  function init() {
    return openDB()
      .then(function () {
        _ready = true;
        // Fire pending callbacks
        _readyCallbacks.forEach(function (cb) { cb(); });
        _readyCallbacks = [];
        return true;
      })
      .catch(function (err) {
        console.warn("IndexedDB unavailable, falling back to localStorage:", err.message);
        _ready = false;
        return false;
      });
  }

  function isReady() {
    return _ready;
  }

  function onReady(callback) {
    if (_ready) {
      callback();
    } else {
      _readyCallbacks.push(callback);
    }
  }

  // ── Migration from localStorage ──────────────────────

  /**
   * Migrate chats from localStorage to IndexedDB.
   * Called once on first boot with IndexedDB available.
   * Only migrates if IndexedDB store is empty (idempotent).
   */
  function migrateFromLocalStorage() {
    return getChatCount().then(function (count) {
      // Already has data in IndexedDB — skip migration
      if (count > 0) {
        return 0;
      }
      try {
        var raw = localStorage.getItem("aether_chats");
        if (!raw) return 0;
        var chats = JSON.parse(raw);
        if (!Array.isArray(chats) || chats.length === 0) {
          localStorage.removeItem("aether_chats");
          return 0;
        }
        return saveAllChats(chats).then(function () {
          localStorage.removeItem("aether_chats");
          return chats.length;
        });
      } catch (e) {
        return Promise.reject(e);
      }
    });
  }

  // ── Export ───────────────────────────────────────────

  window.AetherDB = {
    init: init,
    isReady: isReady,
    onReady: onReady,
    getAllChats: getAllChats,
    getChat: getChat,
    saveChat: saveChat,
    saveAllChats: saveAllChats,
    batchAddChats: batchAddChats,
    deleteChat: deleteChat,
    getChatCount: getChatCount,
    migrateFromLocalStorage: migrateFromLocalStorage,
  };
})(window);
