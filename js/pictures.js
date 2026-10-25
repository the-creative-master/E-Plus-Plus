/*
 * E++ picture book — the binding between a name and a picture.
 *
 * Release 1.2 let you write a whole image inside the program:
 *
 *   create the actor 'hero' with the image "data:image/png;base64,iVBOR...."
 *
 * That line works, but it ties the picture to one line of code, and there is
 * nothing to reuse: every `create` needs the whole blob again, and there is no
 * way to say "this name is this picture" once.
 *
 * A picture book fixes that. A project keeps a small table of
 * name -> picture, and the language then reads as plainly as it sounds:
 *
 *   link the image "hero.png" to the actor 'hero'
 *   create the actor 'hero'                 <- uses the linked picture
 *   put the actor 'hero' at 0 and 0
 *
 * The binding is the point: once a name is linked, that name *is* that picture
 * everywhere — in this file, in the next file of the project, and after a
 * reload — until the link is changed.
 *
 * This module is pure data handling (no DOM), so the Studio, the headless
 * test-suite and the standalone bundle all agree on what a book is.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var MAX_NAME = 40;
  // A picture can be a data: URL, a file next to the page, or a web URL.
  var IMAGE_SOURCE = /^(data:image\/|https?:\/\/|\.{0,2}\/)/i;
  var IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;

  /** A name a program can write between single quotes. */
  function cleanName(raw) {
    return String(raw === undefined || raw === null ? '' : raw)
      .replace(/^['"\s]+|['"\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_NAME);
  }

  function isValidName(name) {
    return /^[A-Za-z][A-Za-z0-9 _-]*$/.test(String(name || ''));
  }

  /** True for anything the browser can hand to an <img>. */
  function isImageSource(value) {
    var text = String(value === undefined || value === null ? '' : value).trim();
    if (!text) return false;
    if (IMAGE_SOURCE.test(text)) return true;
    return IMAGE_FILE.test(text);
  }

  function emptyBook() {
    return Object.create(null);
  }

  /** The book as a plain object, safe to store or send. */
  function toJSON(book) {
    var out = {};
    Object.keys(book || {}).forEach(function (key) {
      var entry = book[key] || {};
      if (!entry.data) return;
      out[key] = {
        name: entry.name || key,
        data: String(entry.data),
        added: entry.added || '',
        width: entry.width || 0,
        height: entry.height || 0
      };
    });
    return out;
  }

  function fromJSON(raw) {
    var book = emptyBook();
    var parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (error) { return book; }
    }
    if (!parsed || typeof parsed !== 'object') return book;
    Object.keys(parsed).forEach(function (key) {
      var entry = parsed[key] || {};
      var name = cleanName(entry.name || key);
      if (!isValidName(name) || !entry.data) return;
      book[name.toLowerCase()] = {
        name: name,
        data: String(entry.data),
        added: String(entry.added || ''),
        width: Number(entry.width) || 0,
        height: Number(entry.height) || 0
      };
    });
    return book;
  }

  /** Links a picture to a name. Returns the entry, or null for a bad link. */
  function put(book, name, data, extra) {
    var clean = cleanName(name);
    if (!book || !isValidName(clean)) return null;
    var source = String(data === undefined || data === null ? '' : data).trim();
    if (!isImageSource(source)) return null;
    var previous = book[clean.toLowerCase()] || {};
    var entry = {
      name: clean,
      data: source,
      added: (extra && extra.added) || previous.added || '',
      width: Number((extra && extra.width) || previous.width) || 0,
      height: Number((extra && extra.height) || previous.height) || 0
    };
    book[clean.toLowerCase()] = entry;
    return entry;
  }

  function get(book, name) {
    if (!book) return null;
    return book[cleanName(name).toLowerCase()] || null;
  }

  function remove(book, name) {
    var key = cleanName(name).toLowerCase();
    if (!book || !book[key]) return false;
    delete book[key];
    return true;
  }

  /** Every picture, in the order it was linked. */
  function list(book) {
    var items = [];
    Object.keys(book || {}).forEach(function (key) { items.push(book[key]); });
    items.sort(function (a, b) {
      if (a.added === b.added) return a.name.localeCompare(b.name);
      if (!a.added) return 1;
      if (!b.added) return -1;
      return a.added < b.added ? -1 : 1;
    });
    return items;
  }

  function isEmpty(book) {
    return Object.keys(book || {}).length === 0;
  }

  /**
   * The name a `create the actor '…'` line or a `link … to the actor '…'`
   * line talks about. Both spellings are accepted.
   */
  var ACTOR_LINE = /^\s*(?:create|link)\s+(?:the\s+)?(?:actor|image)\b/i;

  function namesIn(code) {
    var names = [];
    function add(name) {
      var clean = cleanName(name);
      if (!isValidName(clean)) return;
      if (names.some(function (n) { return n.toLowerCase() === clean.toLowerCase(); })) return;
      names.push(clean);
    }
    String(code || '').split('\n').forEach(function (line) {
      if (!ACTOR_LINE.test(line)) return;
      var matches = line.match(/'([^']+)'/g) || [];
      matches.forEach(function (quoted) { add(quoted.slice(1, -1)); });
    });
    return names;
  }

  /**
   * The actor names a program uses that have no picture linked yet, so the
   * Studio can offer the picture panel instead of drawing an anonymous tile.
   */
  function missing(code, book) {
    return namesIn(code).filter(function (name) { return !get(book, name); });
  }

  /**
   * Projects travel as one sealed text. When a project has pictures, that text
   * is a small envelope so the pictures travel with it; without pictures it
   * stays exactly the plain program it always was.
   */
  function envelope(code, book) {
    var pictures = toJSON(book);
    if (!Object.keys(pictures).length) return String(code || '');
    return JSON.stringify({ epp: 2, code: String(code || ''), pictures: pictures }, null, 2);
  }

  /** The inverse of envelope(): plain code stays plain code. */
  function unwrap(plaintext) {
    var text = String(plaintext === undefined || plaintext === null ? '' : plaintext);
    var trimmed = text.trim();
    if (!trimmed || trimmed.charAt(0) !== '{') return { code: text, pictures: emptyBook() };
    var parsed;
    try { parsed = JSON.parse(trimmed); } catch (error) { return { code: text, pictures: emptyBook() }; }
    if (!parsed || parsed.epp !== 2 || typeof parsed.code !== 'string') {
      return { code: text, pictures: emptyBook() };
    }
    return { code: parsed.code, pictures: fromJSON(parsed.pictures || {}) };
  }

  function looksLikeEnvelope(text) {
    var trimmed = String(text || '').trim();
    return trimmed.charAt(0) === '{' && /"epp"\s*:\s*2/.test(trimmed.slice(0, 200));
  }

  /*
   * The page installs a provider so the interpreter can turn a name into a
   * picture without knowing anything about the project store.
   */
  var provider = null;

  function setProvider(fn) { provider = typeof fn === 'function' ? fn : null; }

  /** The picture linked to a name in the project the page is showing. */
  function resolve(name) {
    if (!provider) return null;
    var entry = provider(cleanName(name));
    return entry ? entry.data : null;
  }

  EPP.Pictures = {
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,
    isValidName: isValidName,
    isImageSource: isImageSource,
    emptyBook: emptyBook,
    fromJSON: fromJSON,
    toJSON: toJSON,
    put: put,
    get: get,
    remove: remove,
    list: list,
    isEmpty: isEmpty,
    namesIn: namesIn,
    missing: missing,
    envelope: envelope,
    unwrap: unwrap,
    looksLikeEnvelope: looksLikeEnvelope,
    setProvider: setProvider,
    resolve: resolve
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Pictures: EPP.Pictures };
  }
})(typeof window !== 'undefined' ? window : globalThis);
