/*!
 * videostorage.js
 * ---------------------------------------------------------------------------
 * Every video that lives on "Totally Not A Social Media Site" is stored by
 * this file. Nothing else touches disk, IndexedDB or localStorage.
 *
 * Two tiers are used so huge clips never choke the catalogue:
 *
 *   1. The CATALOGUE  — small JSON metadata (title, uploader, likes, comments,
 *      tags, ...) kept in localStorage under "tnasm.catalog.v2".
 *   2. The PAYLOADS   — the actual video bytes + poster frames kept as Blobs
 *      in IndexedDB ("tnasm-video-storage"). If IndexedDB is unavailable the
 *      module degrades gracefully to base64 inside localStorage.
 *
 * PORTABILITY
 *   The whole library can be serialised back into a real, human readable
 *   `videostorage.js` file:
 *
 *       VideoStorage.exportJS()  ->  "window.TNA_VIDEO_STORAGE = { ... }"
 *
 *   Drop that exported file next to index.html and it is picked up
 *   automatically on the next page load (see seedFromGlobal below), so the
 *   site really can keep its videos inside videostorage.js.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.VideoStorage = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DB_NAME = "tnasm-video-storage";
  var DB_VERSION = 1;
  var STORE_VIDEOS = "videos";
  var STORE_POSTERS = "posters";
  var CATALOG_KEY = "tnasm.catalog.v2";
  var PERSONAS_KEY = "tnasm.personas.v2";
  var SEED_FLAG_KEY = "tnasm.seed.v2";

  var dbPromise = null;
  var backend = "unknown"; // "indexeddb" | "local"
  var posterUrls = Object.create(null);
  var listeners = { change: [], persona: [] };

  /* ---------------------------------------------------------------- utils */

  function uid(prefix) {
    return (
      (prefix || "v") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readJSON(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
    return function off() {
      listeners[event] = listeners[event].filter(function (h) {
        return h !== handler;
      });
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (handler) {
      try {
        handler(payload);
      } catch (err) {
        if (root.console) root.console.error("[videostorage] listener failed", err);
      }
    });
  }

  /* ------------------------------------------------------- IndexedDB tier */

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }
      var request;
      try {
        request = root.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
          db.createObjectStore(STORE_VIDEOS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_POSTERS)) {
          db.createObjectStore(STORE_POSTERS, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Could not open the video database."));
      };
      request.onblocked = function () {
        reject(new Error("The video database is blocked by another tab."));
      };
    }).catch(function (err) {
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  }

  function idbRequest(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function idbWrite(storeName, mode, work) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var outcome;
        try {
          outcome = work(store);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = function () {
          resolve(outcome && outcome.__request ? outcome.__request.result : outcome);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error("Transaction aborted."));
        };
      });
    });
  }

  /* ------------------------------------------------------ localStorage tier */

  function localKey(id) {
    return "tnasm.data." + id;
  }

  function localPosterKey(id) {
    return "tnasm.poster." + id;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      if (!root.FileReader) {
        reject(new Error("FileReader is not available."));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Could not read the file."));
      };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mime) {
    var binary = root.atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }

  function dataUrlToBlob(dataUrl) {
    var comma = String(dataUrl).indexOf(",");
    var header = comma >= 0 ? dataUrl.slice(0, comma) : "";
    var payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    var mime = (header.match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
    return base64ToBlob(payload, mime);
  }

  /* ------------------------------------------------------------ catalogue */

  function catalog() {
    var list = readJSON(CATALOG_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveCatalog(list) {
    var ok = writeJSON(CATALOG_KEY, list);
    if (!ok && root.console) {
      root.console.warn("[videostorage] catalogue could not be written to localStorage");
    }
    return ok;
  }

  function upsert(entry) {
    var list = catalog();
    var index = list.findIndex(function (item) {
      return item.id === entry.id;
    });
    if (index >= 0) list[index] = entry;
    else list.unshift(entry);
    saveCatalog(list);
    emit("change", { type: index >= 0 ? "update" : "create", entry: entry });
    return entry;
  }

  function patchCatalog(id, patch) {
    var list = catalog();
    var index = list.findIndex(function (item) {
      return item.id === id;
    });
    if (index < 0) return null;
    list[index] = Object.assign({}, list[index], patch);
    saveCatalog(list);
    emit("change", { type: "update", entry: list[index] });
    return list[index];
  }

  /* -------------------------------------------------------------- payloads */

  function storeVideoPayload(id, blob) {
    if (backend === "indexeddb") {
      return idbWrite(STORE_VIDEOS, "readwrite", function (store) {
        return { __request: store.put({ id: id, blob: blob, savedAt: nowISO() }) };
      });
    }
    return blobToBase64(blob).then(function (base64) {
      var ok = writeJSON(localKey(id), { mime: blob.type, size: blob.size, base64: base64 });
      if (!ok) throw new Error("Local storage is full - delete a video or export your library.");
      return true;
    });
  }

  function readVideoPayload(id) {
    if (backend === "indexeddb") {
      return openDB()
        .then(function (db) {
          return idbRequest(db.transaction(STORE_VIDEOS, "readonly").objectStore(STORE_VIDEOS).get(id));
        })
        .then(function (row) {
          return row ? row.blob : null;
        })
        .catch(function () {
          return null;
        });
    }
    var row = readJSON(localKey(id), null);
    if (!row) return Promise.resolve(null);
    try {
      return Promise.resolve(base64ToBlob(row.base64, row.mime));
    } catch (err) {
      return Promise.resolve(null);
    }
  }

  function deleteVideoPayload(id) {
    if (posterUrls[id]) {
      try {
        root.URL.revokeObjectURL(posterUrls[id]);
      } catch (err) {
        /* ignore */
      }
      delete posterUrls[id];
    }
    if (backend === "indexeddb") {
      return openDB()
        .then(function (db) {
          var tx = db.transaction([STORE_VIDEOS, STORE_POSTERS], "readwrite");
          tx.objectStore(STORE_VIDEOS).delete(id);
          tx.objectStore(STORE_POSTERS).delete(id);
          return new Promise(function (resolve) {
            tx.oncomplete = resolve;
            tx.onerror = resolve;
            tx.onabort = resolve;
          });
        })
        .catch(function () {
          return true;
        });
    }
    try {
      root.localStorage.removeItem(localKey(id));
      root.localStorage.removeItem(localPosterKey(id));
    } catch (err) {
      /* ignore */
    }
    return Promise.resolve(true);
  }

  function storePosterPayload(id, blob) {
    if (!blob) return Promise.resolve(false);
    if (backend === "indexeddb") {
      return idbWrite(STORE_POSTERS, "readwrite", function (store) {
        return { __request: store.put({ id: id, blob: blob }) };
      }).catch(function () {
        return false;
      });
    }
    return blobToBase64(blob)
      .then(function (base64) {
        writeJSON(localPosterKey(id), { mime: blob.type, base64: base64 });
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function readPosterPayload(id) {
    if (backend === "indexeddb") {
      return openDB()
        .then(function (db) {
          return idbRequest(db.transaction(STORE_POSTERS, "readonly").objectStore(STORE_POSTERS).get(id));
        })
        .then(function (row) {
          return row ? row.blob : null;
        })
        .catch(function () {
          return null;
        });
    }
    var row = readJSON(localPosterKey(id), null);
    if (!row) return Promise.resolve(null);
    try {
      return Promise.resolve(base64ToBlob(row.base64, row.mime));
    } catch (err) {
      return Promise.resolve(null);
    }
  }

  /* ----------------------------------------------------------------- API */

  var VideoStorage = {
    /** Identifies where payloads live: "indexeddb" or "local". */
    backend: function () {
      return backend;
    },

    /** Opens the database and imports any bundled videostorage.js payload. */
    init: function () {
      if (backend === "indexeddb") {
        return VideoStorage.seedFromGlobal().then(function () {
          return VideoStorage;
        });
      }
      return openDB()
        .then(function () {
          backend = "indexeddb";
          return VideoStorage.seedFromGlobal();
        })
        .then(function () {
          return VideoStorage;
        })
        .catch(function () {
          backend = "local";
          return VideoStorage.seedFromGlobal().then(function () {
            return VideoStorage;
          });
        });
    },

    /** Every catalogue entry, newest first. */
    list: function () {
      return catalog().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    },

    get: function (id) {
      var found = catalog().find(function (item) {
        return item.id === id;
      });
      return found ? clone(found) : null;
    },

    /** Saves a video (blob + poster) together with its catalogue metadata. */
    save: function (options) {
      options = options || {};
      var blob = options.blob;
      if (!blob) return Promise.reject(new Error("A video blob is required."));
      var id = options.id || uid("v");
      var entry = {
        id: id,
        title: options.title || "Untitled upload",
        description: options.description || "",
        tags: normalizeTags(options.tags),
        uploader: options.uploader || "anonymous",
        uploaderId: options.uploaderId || "",
        createdAt: options.createdAt || nowISO(),
        duration: Number(options.duration) || 0,
        width: Number(options.width) || 0,
        height: Number(options.height) || 0,
        size: blob.size || 0,
        mime: blob.type || options.mime || "video/mp4",
        likes: Number(options.likes) || 0,
        dislikes: Number(options.dislikes) || 0,
        views: Number(options.views) || 0,
        comments: Array.isArray(options.comments) ? options.comments : [],
        visibility: options.visibility || "public",
        hasPoster: Boolean(options.poster),
        source: options.source || "upload"
      };
      return storeVideoPayload(id, blob)
        .then(function () {
          if (options.posterBlob) {
            return storePosterPayload(id, options.posterBlob).then(function (stored) {
              entry.hasPoster = Boolean(stored);
            });
          }
          return entry;
        })
        .then(function () {
          upsert(entry);
          return clone(entry);
        });
    },

    /** Updates mutable metadata (likes, views, comments, description...). */
    update: function (id, patch) {
      var updated = patchCatalog(id, patch || {});
      return updated ? clone(updated) : null;
    },

    remove: function (id) {
      var list = catalog().filter(function (item) {
        return item.id !== id;
      });
      saveCatalog(list);
      return deleteVideoPayload(id).then(function () {
        emit("change", { type: "delete", entry: { id: id } });
        return true;
      });
    },

    /** Raw video bytes for a catalogue entry (null when missing). */
    getBlob: function (id) {
      return readVideoPayload(id);
    },

    /** Poster frame for a catalogue entry (null when missing). */
    getPosterBlob: function (id) {
      return readPosterPayload(id);
    },

    /** Cached object URL for a poster, ready to drop into <img>/<video>. */
    getPosterURL: function (id) {
      if (posterUrls[id]) return posterUrls[id];
      return readPosterPayload(id).then(function (blob) {
        if (!blob) return null;
        var url = root.URL.createObjectURL(blob);
        posterUrls[id] = url;
        return url;
      });
    },

    /** Rough storage report for the "storage" widget. */
    usage: function () {
      var list = catalog();
      var bytes = list.reduce(function (sum, item) {
        return sum + (Number(item.size) || 0);
      }, 0);
      return {
        videos: list.length,
        bytes: bytes,
        backend: backend,
        views: list.reduce(function (sum, item) {
          return sum + (Number(item.views) || 0);
        }, 0),
        likes: list.reduce(function (sum, item) {
          return sum + (Number(item.likes) || 0);
        }, 0)
      };
    },

    /* ------------------------------------------------------- import/export */

    /** Serialises the whole library into a `videostorage.js` source file. */
    exportJS: function (options) {
      options = options || {};
      var list = catalog();
      var includePayloads = options.includePayloads !== false;
      var pending = list.map(function (entry) {
        var copy = clone(entry);
        if (!includePayloads) {
          copy.data = null;
          return Promise.resolve(copy);
        }
        return readVideoPayload(entry.id).then(function (blob) {
          if (!blob) {
            copy.data = null;
            return copy;
          }
          return blobToBase64(blob).then(function (base64) {
            copy.data = "data:" + (blob.type || entry.mime || "video/mp4") + ";base64," + base64;
            return copy;
          });
        });
      });
      return Promise.all(pending).then(function (videos) {
        var payload = {
          version: 2,
          exportedAt: nowISO(),
          site: "Totally Not A Social Media Site",
          videos: videos
        };
        return [
          "/*!",
          " * videostorage.js - exported from Totally Not A Social Media Site",
          " * Generated: " + payload.exportedAt,
          " * Videos: " + videos.length,
          " *",
          " * Drop this file next to index.html and every video comes back with the site.",
          " */",
          "(function (global) {",
          "  global.TNA_VIDEO_STORAGE = " + JSON.stringify(payload, null, 2) + ";",
          "})(typeof globalThis !== 'undefined' ? globalThis : this);",
          ""
        ].join("\n");
      });
    },

    /** Imports a `videostorage.js` source file (string) into the library. */
    importJS: function (source, options) {
      options = options || {};
      var payload = parseStorageSource(source);
      if (!payload || !Array.isArray(payload.videos)) {
        return Promise.reject(new Error("That file does not look like a videostorage.js export."));
      }
      var added = 0;
      var skipped = 0;
      var chain = Promise.resolve();
      payload.videos.forEach(function (entry) {
        chain = chain.then(function () {
          var existing = VideoStorage.get(entry.id);
          if (existing && !options.overwrite) {
            skipped++;
            return null;
          }
          var blobPromise = entry.data
            ? Promise.resolve(dataUrlToBlob(entry.data))
            : readVideoPayload(entry.id);
          return blobPromise.then(function (blob) {
            if (!blob) {
              skipped++;
              return null;
            }
            return VideoStorage.save({
              id: entry.id,
              blob: blob,
              title: entry.title,
              description: entry.description,
              tags: entry.tags,
              uploader: entry.uploader,
              uploaderId: entry.uploaderId,
              createdAt: entry.createdAt,
              duration: entry.duration,
              width: entry.width,
              height: entry.height,
              mime: entry.mime,
              likes: entry.likes,
              dislikes: entry.dislikes,
              views: entry.views,
              comments: entry.comments,
              visibility: entry.visibility,
              source: "import"
            }).then(function () {
              added++;
            });
          });
        });
      });
      return chain.then(function () {
        return { added: added, skipped: skipped };
      });
    },

    /** Picks up `window.TNA_VIDEO_STORAGE` (a bundled videostorage.js). */
    seedFromGlobal: function () {
      var payload = root.TNA_VIDEO_STORAGE;
      if (!payload || !Array.isArray(payload.videos) || !payload.videos.length) {
        return Promise.resolve({ added: 0, skipped: 0 });
      }
      var flag = readJSON(SEED_FLAG_KEY, null);
      if (flag && flag.signature === signatureOf(payload)) {
        return Promise.resolve({ added: 0, skipped: 0 });
      }
      return VideoStorage.importJS(JSON.stringify(payload), { overwrite: false }).then(function (result) {
        writeJSON(SEED_FLAG_KEY, { signature: signatureOf(payload), at: nowISO() });
        return result;
      });
    },

    /* ------------------------------------------------------------ personas */

    personas: function () {
      var state = readJSON(PERSONAS_KEY, null);
      if (!state || !Array.isArray(state.list)) return { current: null, list: [] };
      return state;
    },

    currentPersona: function () {
      var state = VideoStorage.personas();
      if (!state.current) return null;
      return (
        state.list.find(function (persona) {
          return persona.id === state.current;
        }) || null
      );
    },

    createPersona: function (name) {
      var clean = String(name || "").trim().slice(0, 24);
      if (!clean) return null;
      var state = VideoStorage.personas();
      var existing = state.list.find(function (persona) {
        return persona.name.toLowerCase() === clean.toLowerCase();
      });
      if (existing) {
        state.current = existing.id;
        writeJSON(PERSONAS_KEY, state);
        emit("persona", existing);
        return existing;
      }
      var persona = {
        id: uid("p"),
        name: clean,
        createdAt: nowISO(),
        reactions: { liked: {}, disliked: {} }
      };
      state.list.push(persona);
      state.current = persona.id;
      writeJSON(PERSONAS_KEY, state);
      emit("persona", persona);
      return persona;
    },

    setCurrentPersona: function (id) {
      var state = VideoStorage.personas();
      var found = state.list.find(function (persona) {
        return persona.id === id;
      });
      if (!found) return null;
      state.current = id;
      writeJSON(PERSONAS_KEY, state);
      emit("persona", found);
      return found;
    },

    forgetPersona: function (id) {
      var state = VideoStorage.personas();
      state.list = state.list.filter(function (persona) {
        return persona.id !== id;
      });
      if (state.current === id) state.current = state.list.length ? state.list[0].id : null;
      writeJSON(PERSONAS_KEY, state);
      emit("persona", VideoStorage.currentPersona());
      return state;
    },

    /** Records a like/dislike for the active persona (toggle semantics). */
    react: function (videoId, kind) {
      var persona = VideoStorage.currentPersona();
      if (!persona) return null;
      var entry = VideoStorage.get(videoId);
      if (!entry) return null;
      var state = VideoStorage.personas();
      var stored = state.list.find(function (item) {
        return item.id === persona.id;
      });
      stored.reactions = stored.reactions || { liked: {}, disliked: {} };
      var liked = Boolean(stored.reactions.liked[videoId]);
      var disliked = Boolean(stored.reactions.disliked[videoId]);
      var nextLikes = Number(entry.likes) || 0;
      var nextDislikes = Number(entry.dislikes) || 0;
      var active = kind === "like" ? liked : disliked;

      if (active) {
        if (kind === "like") {
          delete stored.reactions.liked[videoId];
          nextLikes = Math.max(0, nextLikes - 1);
        } else {
          delete stored.reactions.disliked[videoId];
          nextDislikes = Math.max(0, nextDislikes - 1);
        }
      } else {
        if (kind === "like") {
          delete stored.reactions.disliked[videoId];
          nextDislikes = Math.max(0, nextDislikes - 1);
          stored.reactions.liked[videoId] = 1;
          nextLikes += 1;
        } else {
          delete stored.reactions.liked[videoId];
          nextLikes = Math.max(0, nextLikes - 1);
          stored.reactions.disliked[videoId] = 1;
          nextDislikes += 1;
        }
      }
      writeJSON(PERSONAS_KEY, state);
      VideoStorage.update(videoId, { likes: nextLikes, dislikes: nextDislikes });
      return { liked: Boolean(stored.reactions.liked[videoId]), disliked: Boolean(stored.reactions.disliked[videoId]) };
    },

    /** Has the active persona liked / disliked this video? */
    reactionState: function (videoId) {
      var persona = VideoStorage.currentPersona();
      if (!persona) return { liked: false, disliked: false };
      var state = VideoStorage.personas();
      var stored = state.list.find(function (item) {
        return item.id === persona.id;
      });
      if (!stored || !stored.reactions) return { liked: false, disliked: false };
      return {
        liked: Boolean(stored.reactions.liked && stored.reactions.liked[videoId]),
        disliked: Boolean(stored.reactions.disliked && stored.reactions.disliked[videoId])
      };
    },

    on: on
  };

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags
        .map(function (tag) {
          return String(tag).trim().slice(0, 24);
        })
        .filter(Boolean)
        .slice(0, 8);
    }
    if (typeof tags === "string") {
      return tags
        .split(/[\s,]+/)
        .map(function (tag) {
          return tag.trim().replace(/^#/, "").slice(0, 24);
        })
        .filter(Boolean)
        .slice(0, 8);
    }
    return [];
  }

  function signatureOf(payload) {
    var ids = payload.videos
      .map(function (video) {
        return video.id;
      })
      .sort()
      .join(",");
    return payload.videos.length + ":" + ids;
  }

  /** Pulls the JSON payload out of a videostorage.js source file. */
  function parseStorageSource(source) {
    var text = String(source || "");
    var marker = text.indexOf("TNA_VIDEO_STORAGE");
    var from = marker >= 0 ? marker : 0;
    var slice = extractJSONObject(text, from);
    if (!slice) return null;
    try {
      return JSON.parse(slice);
    } catch (err) {
      return null;
    }
  }

  /** Brace matched JSON extraction that ignores braces inside strings. */
  function extractJSONObject(text, fromIndex) {
    var start = text.indexOf("{", fromIndex || 0);
    if (start < 0) return null;
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  VideoStorage.__internals = {
    parseStorageSource: parseStorageSource,
    normalizeTags: normalizeTags,
    blobToBase64: blobToBase64,
    base64ToBlob: base64ToBlob
  };

  return VideoStorage;
});
