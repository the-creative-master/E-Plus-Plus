/*
 * E++ .eppl and .eppla file system (Dev Build 4).
 *
 * .eppl  is for files WITHOUT any libraries.
 * .eppla is for files WITH libraries (ANY library).
 *
 * Only the E++ IDE creates, loads, saves and interprets .eppl and .eppla files.
 * Files live in the browser's localStorage so they survive reloads, and
 * any attempt to import, open or run a file that does not end in .eppl or .eppla
 * is rejected with a handcrafted FileError.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var FileError = EPP.FileError;
  var STORAGE_KEY = 'eplusplus.files.v1';

  function MemoryStorage() { this.data = {}; }
  MemoryStorage.prototype.getItem = function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; };
  MemoryStorage.prototype.setItem = function (k, v) { this.data[k] = String(v); };
  MemoryStorage.prototype.removeItem = function (k) { delete this.data[k]; };

  function defaultStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        var probe = '__eppl_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return localStorage;
      }
    } catch (e) { /* private mode etc. — fall through to memory */ }
    return new MemoryStorage();
  }

  function isEpplFile(name) {
    return typeof name === 'string' && /\.(eppl|eppla)$/i.test(name.trim());
  }

  function isEpplaFile(name) {
    return typeof name === 'string' && /\.eppla$/i.test(name.trim());
  }

  function hasLibraryUsage(source) {
    if (!source || typeof source !== 'string') return false;
    if (/\b(?:add\s+library|library\s+["'][^"']+["']\s*(?:add|load|import))\b/i.test(source)) return true;
    if (/\b(?:drawing\s+sprite|python\s+code)\b/i.test(source)) return true;
    if (/\b(?:square\s+root\s+of|as\s+fraction|as\s+decimal|divided\s+by|power\s+of|percent\s+of)\b/i.test(source)) return true;
    if (/\b(?:uppercase\s+of|lowercase\s+of|length\s+of|random\s+number\s+between)\b/i.test(source)) return true;
    // Dev Build 5: Image library + new condition patterns
    if (/\b(?:display\s+image|as\s+image|check\s+if.*exists|is\s+(?:a\s+)?(?:positive|negative)\s+number|is\s+(?:not\s+)?in\s+the\s+range\s+of|\bcontains\b)\b/i.test(source)) return true;
    return false;
  }

  /**
   * Normalises/validates a file name.
   * .eppl  = without any libraries
   * .eppla = with libraries
   */
  function validateFileName(name, content) {
    var clean = String(name === undefined || name === null ? '' : name).trim().replace(/\\/g, '/');
    if (!clean) throw new FileError('A file needs a name.', null, null, 'For example: hello.eppl or math.eppla');
    if (clean.indexOf('/') !== -1) throw new FileError('File names cannot contain folders ("/").', null, null, 'Give the file a simple name such as quiz.eppl.');
    if (/\.(eppl|eppla)$/i.test(clean)) return clean;
    if (/\.[A-Za-z0-9]+$/.test(clean)) {
      throw new FileError('The E++ IDE only works with .eppl and .eppla files — "' + clean + '" has an invalid extension.',
        null, null, 'Use .eppl for files without libraries, or .eppla for files with libraries.');
    }
    var withLibs = content && hasLibraryUsage(content);
    return clean + (withLibs ? '.eppla' : '.eppl');
  }

  function EpplFileStore(storage) {
    this.storage = storage || defaultStorage();
  }

  EpplFileStore.prototype.readAll = function () {
    try {
      var raw = this.storage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  };

  EpplFileStore.prototype.writeAll = function (files) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(files));
  };

  EpplFileStore.prototype.listFiles = function () {
    var files = this.readAll();
    return Object.keys(files).map(function (name) {
      return { name: name, content: files[name].content, createdAt: files[name].createdAt, updatedAt: files[name].updatedAt };
    }).sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  };

  EpplFileStore.prototype.exists = function (name) {
    return Object.prototype.hasOwnProperty.call(this.readAll(), name);
  };

  EpplFileStore.prototype.getFile = function (name) {
    var files = this.readAll();
    if (!Object.prototype.hasOwnProperty.call(files, name)) {
      throw new FileError('There is no file called "' + name + '".', null, null, 'Create it with the New File button, or pick another file in the explorer.');
    }
    return { name: name, content: files[name].content, createdAt: files[name].createdAt, updatedAt: files[name].updatedAt };
  };

  EpplFileStore.prototype.createFile = function (name, content) {
    var valid = validateFileName(name, content);
    if (this.exists(valid)) throw new FileError('A file called "' + valid + '" already exists.', null, null, 'Pick a different name, or open the existing file.');
    return this.saveFile(valid, content === undefined ? '' : content, true);
  };

  EpplFileStore.prototype.saveFile = function (name, content, isNew) {
    var valid = validateFileName(name, content);
    var files = this.readAll();
    var now = new Date().toISOString();
    files[valid] = {
      content: String(content === undefined || content === null ? '' : content),
      createdAt: files[valid] ? files[valid].createdAt : now,
      updatedAt: now
    };
    this.writeAll(files);
    return { name: valid, content: files[valid].content, createdAt: files[valid].createdAt, updatedAt: files[valid].updatedAt };
  };

  EpplFileStore.prototype.deleteFile = function (name) {
    var files = this.readAll();
    if (!Object.prototype.hasOwnProperty.call(files, name)) throw new FileError('There is no file called "' + name + '".');
    delete files[name];
    this.writeAll(files);
  };

  EpplFileStore.prototype.renameFile = function (oldName, newName) {
    var file = this.getFile(oldName);
    var valid = validateFileName(newName, file.content);
    if (valid === oldName) return file;
    if (this.exists(valid)) throw new FileError('A file called "' + valid + '" already exists.', null, null, 'Pick a different name.');
    var files = this.readAll();
    delete files[oldName];
    files[valid] = { content: file.content, createdAt: file.createdAt, updatedAt: new Date().toISOString() };
    this.writeAll(files);
    return { name: valid, content: file.content };
  };

  EpplFileStore.prototype.seedIfEmpty = function (examples) {
    // Remember that seeding happened, so files a user deliberately deleted
    // do not come back on the next load.
    var seededKey = STORAGE_KEY + '.seeded';
    if (this.listFiles().length > 0) {
      try { this.storage.setItem(seededKey, '1'); } catch (e) { /* ignore */ }
      return false;
    }
    try { if (this.storage.getItem(seededKey)) return false; } catch (e) { /* ignore */ }
    var self = this;
    (examples || []).forEach(function (ex) { self.saveFile(ex.name, ex.content, true); });
    try { this.storage.setItem(seededKey, '1'); } catch (e) { /* ignore */ }
    return true;
  };

  /**
   * Downloads the file as a real .eppl or .eppla file (browser only).
   * Uses application/octet-stream so browsers never append .txt.
   */
  EpplFileStore.prototype.exportFile = function (name) {
    var file = this.getFile(name);
    if (!isEpplFile(file.name)) throw new FileError('Only .eppl or .eppla files can be exported.');
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      throw new FileError('Exporting is only available inside the E++ IDE in a browser.');
    }

    var exportName = file.name;
    var hasLibs = hasLibraryUsage(file.content);
    if (hasLibs && /\.eppl$/i.test(exportName)) {
      exportName = exportName.replace(/\.eppl$/i, '.eppla');
    } else if (!hasLibs && /\.eppla$/i.test(exportName)) {
      exportName = exportName.replace(/\.eppla$/i, '.eppl');
    }

    // application/octet-stream ensures the browser honors the exact file extension without appending .txt
    var blob = new Blob([file.content], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = exportName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    return file;
  };

  /**
   * Imports a File object chosen/dropped by the user. Only .eppl and .eppla
   * files are accepted — anything else is rejected.
   */
  EpplFileStore.prototype.importFile = function (file, options) {
    options = options || {};
    if (!file || !isEpplFile(file.name || '')) {
      return Promise.reject(new FileError(
        'The E++ IDE only opens .eppl and .eppla files' + (file && file.name ? ' — "' + file.name + '" is not one.' : '.'),
        null, null, 'Choose a file whose name ends in .eppl or .eppla.'));
    }
    var store = this;
    return Promise.resolve(file.text()).then(function (text) {
      var name = file.name.split('/').pop();
      var ext = /\.eppla$/i.test(name) ? '.eppla' : '.eppl';
      if (store.exists(name) && !options.overwrite) {
        var base = name.replace(/\.(eppl|eppla)$/i, '');
        var candidate = base + ' (imported)' + ext;
        var n = 2;
        while (store.exists(candidate)) { candidate = base + ' (imported ' + n + ')' + ext; n += 1; }
        name = candidate;
      }
      return store.saveFile(name, text, true);
    });
  };

  /** Import from raw text (used by tests and drag data). Validates the name. */
  EpplFileStore.prototype.importText = function (name, text) {
    if (!isEpplFile(name || '')) {
      throw new FileError('The E++ IDE only opens .eppl and .eppla files — "' + name + '" is not one.', null, null, 'Rename it so it ends in .eppl or .eppla.');
    }
    return this.saveFile(name, text, true);
  };

  EPP.EpplFileStore = EpplFileStore;
  EPP.isEpplFile = isEpplFile;
  EPP.isEpplaFile = isEpplaFile;
  EPP.hasLibraryUsage = hasLibraryUsage;
  EPP.validateEpplFileName = validateFileName;
  EPP.MemoryStorage = MemoryStorage;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EpplFileStore: EpplFileStore,
      isEpplFile: isEpplFile,
      isEpplaFile: isEpplaFile,
      hasLibraryUsage: hasLibraryUsage,
      validateFileName: validateFileName,
      MemoryStorage: MemoryStorage
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
