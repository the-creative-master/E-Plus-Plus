/*
 * E++ Tutorial engine (Dev Build 6.1.1).
 *
 * Project Humanizer — the tutorial is NOT hardbaked into the IDE any more.
 * Lesson content lives in the tutorial lesson pack (tutorial/pack.json, with
 * the generated js/tutorial-pack.js as the offline fallback). This module
 * loads, validates, merges and stores packs so the IDE only renders them.
 *
 * Pack sources, in order:
 *   1. tutorial/pack.json  — fetched at runtime when the IDE is served over
 *                            http(s), so editing the file updates the lesson.
 *   2. EPP.TutorialPack    — the generated offline copy (file://, no network).
 *   3. Your own lessons    — added in the IDE and kept in localStorage, and
 *                            any pack you import from the tutorial dialog.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var PACK_URL = 'tutorial/pack.json';
  var CUSTOM_KEY = 'eplusplus.tutorial.custom.v1';
  var PROGRESS_KEY = 'eplusplus.tutorial.progress.v1';
  var FORMAT = 'eplusplus-tutorial-pack';
  var MAX_LESSONS = 200;

  function hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function storage() {
    try {
      if (global.localStorage) return global.localStorage;
    } catch (e) { /* private mode / file:// with storage blocked */ }
    return null;
  }

  function readJson(key, fallback) {
    var store = storage();
    if (!store) return fallback;
    try {
      var raw = store.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    var store = storage();
    if (!store) return false;
    try {
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function stringField(lesson, field) {
    return lesson && typeof lesson[field] === 'string' ? lesson[field] : '';
  }

  /** Normalises a possibly hand-written lesson into the version the IDE uses. */
  function normaliseLesson(lesson) {
    lesson = lesson || {};
    var code = stringField(lesson, 'code');
    var id = hasValue(lesson.id)
      ? String(lesson.id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : 'lesson';
    return {
      id: id,
      title: stringField(lesson, 'title').trim() || 'Untitled lesson',
      badge: stringField(lesson, 'badge').trim() || 'Lesson',
      summary: stringField(lesson, 'summary').trim() || stringField(lesson, 'title').trim(),
      explanation: stringField(lesson, 'explanation').trim(),
      code: code,
      fileName: hasValue(lesson.fileName) ? String(lesson.fileName).trim() : '',
      custom: lesson.custom === true
    };
  }

  /** Returns a list of human-readable problems; an empty list means valid. */
  function validateLesson(lesson, index) {
    var problems = [];
    var label = 'Lesson ' + ((index === undefined ? 0 : index) + 1);
    if (!lesson || typeof lesson !== 'object') return [label + ' is not an object.'];
    if (!hasValue(lesson.id)) problems.push(label + ' needs an "id".');
    if (!hasValue(lesson.title)) problems.push(label + ' needs a "title".');
    if (!hasValue(lesson.summary)) problems.push(label + ' needs a "summary".');
    if (!hasValue(lesson.code)) problems.push(label + ' needs "code" to show in the tutorial.');
    if (hasValue(lesson.code) && EPP.isEpplFile && !EPP.isEpplFile(suggestFileName(lesson))) {
      problems.push(label + ' has a file name that is not .eppl or .eppla.');
    }
    return problems;
  }

  /** Lesson example files are saved into the file explorer, so they need a name. */
  function suggestFileName(lesson) {
    if (lesson && hasValue(lesson.fileName)) {
      var named = lesson.fileName.trim();
      if (/\.(eppl|eppla)$/i.test(named)) return named;
      return named.replace(/\.+$/, '') + '.eppl';
    }
    var id = lesson && hasValue(lesson.id) ? lesson.id : 'lesson';
    var slug = String(id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson';
    var usesLibraries = EPP.hasLibraryUsage ? EPP.hasLibraryUsage(lesson && lesson.code ? lesson.code : '') : false;
    return 'tutorial-' + slug + (usesLibraries ? '.eppla' : '.eppl');
  }

  function bundledPack() {
    var pack = EPP.TutorialPack;
    if (pack && Array.isArray(pack.lessons)) {
      return { format: pack.format || FORMAT, version: pack.version || '6.1', title: pack.title || 'E++ Guided Tutorial', description: pack.description || '', lessons: pack.lessons };
    }
    return { format: FORMAT, version: '0', title: 'E++ Guided Tutorial', description: '', lessons: [] };
  }

  /** Parses a pack from JSON text (imported file or fetched pack.json). */
  function parsePack(text) {
    if (typeof text !== 'string') return { ok: false, error: 'A lesson pack must be JSON text.' };
    var value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That lesson pack is not valid JSON: ' + e.message };
    }
    return parsePackValue(value);
  }

  function parsePackValue(value) {
    if (!value || typeof value !== 'object') return { ok: false, error: 'A lesson pack must be a JSON object with a "lessons" list.' };
    var rawLessons = Array.isArray(value) ? value : value.lessons;
    if (!Array.isArray(rawLessons) || rawLessons.length === 0) {
      return { ok: false, error: 'The lesson pack has no lessons in it (expected a non-empty "lessons" array).' };
    }
    if (rawLessons.length > MAX_LESSONS) {
      return { ok: false, error: 'That pack has ' + rawLessons.length + ' lessons — the maximum is ' + MAX_LESSONS + '.' };
    }
    var problems = [];
    var lessons = [];
    var ids = {};
    rawLessons.forEach(function (raw, index) {
      problems = problems.concat(validateLesson(raw, index));
      var lesson = normaliseLesson(raw);
      if (ids[lesson.id]) {
        problems.push('Lesson ' + (index + 1) + ' reuses the id "' + lesson.id + '".');
      }
      ids[lesson.id] = true;
      lesson.fileName = suggestFileName(lesson);
      lesson.custom = lesson.custom === true;
      lessons.push(lesson);
    });
    if (problems.length) return { ok: false, error: problems.join('\n'), problems: problems };
    return {
      ok: true,
      pack: {
        format: hasValue(value.format) ? value.format : FORMAT,
        version: hasValue(value.version) ? value.version : 'custom',
        title: hasValue(value.title) ? value.title : 'Imported Lesson Pack',
        description: hasValue(value.description) ? value.description : '',
        lessons: lessons
      }
    };
  }

  function customLessons() {
    var raw = readJson(CUSTOM_KEY, []);
    if (!Array.isArray(raw)) return [];
    var lessons = [];
    raw.forEach(function (entry, index) {
      if (validateLesson(entry, index).length === 0) {
        var lesson = normaliseLesson(entry);
        lesson.custom = true;
        lesson.fileName = suggestFileName(lesson);
        lessons.push(lesson);
      }
    });
    return lessons;
  }

  function saveCustomLessons(lessons) {
    return writeJson(CUSTOM_KEY, lessons.map(function (lesson) {
      return {
        id: lesson.id, title: lesson.title, badge: lesson.badge,
        summary: lesson.summary, explanation: lesson.explanation,
        code: lesson.code, fileName: lesson.fileName, custom: true
      };
    }));
  }

  /** Turns lesson text / a title into a safe, unique lesson id. */
  function makeLessonId(title, existing) {
    var base = String(title || 'lesson').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson';
    var id = base;
    var taken = {};
    (existing || []).forEach(function (lesson) { taken[lesson.id] = true; });
    var n = 2;
    while (taken[id]) { id = base + '-' + n; n += 1; }
    return id;
  }

  function addCustomLesson(lesson, existing) {
    var candidate = normaliseLesson(lesson);
    var lessons = customLessons();
    var all = (existing || []).concat(lessons);
    var problems = validateLesson(candidate, lessons.length);
    if (problems.length) return { ok: false, error: problems.join('\n') };
    candidate.id = makeLessonId(candidate.custom === true && hasValue(lesson.id) ? lesson.id : candidate.title, all);
    candidate.custom = true;
    candidate.fileName = suggestFileName(candidate);
    lessons.push(candidate);
    return saveCustomLessons(lessons)
      ? { ok: true, lesson: candidate, lessons: lessons }
      : { ok: false, error: 'Your browser would not let the IDE store that lesson locally.' };
  }

  function removeCustomLesson(id) {
    var lessons = customLessons().filter(function (lesson) { return lesson.id !== id; });
    saveCustomLessons(lessons);
    return lessons;
  }

  function clearCustomLessons() {
    var store = storage();
    if (store) { try { store.removeItem(CUSTOM_KEY); } catch (e) { /* ignore */ } }
    return [];
  }

  function exportPack(pack) {
    var value = pack && Array.isArray(pack.lessons) ? pack : bundledPack();
    return JSON.stringify({
      format: FORMAT,
      version: value.version || 'custom',
      title: value.title || 'E++ Guided Tutorial',
      description: value.description || 'Exported from the E++ IDE.',
      lessons: value.lessons.map(function (lesson) {
        return {
          id: lesson.id, title: lesson.title, badge: lesson.badge,
          summary: lesson.summary, explanation: lesson.explanation,
          code: lesson.code, fileName: lesson.fileName
        };
      })
    }, null, 2);
  }

  // ------------------------------------------------------------------
  // Lesson progress (which lessons you have visited)
  // ------------------------------------------------------------------
  function getProgress() {
    var raw = readJson(PROGRESS_KEY, {});
    if (!raw || typeof raw !== 'object') raw = {};
    if (!Array.isArray(raw.visited)) raw.visited = [];
    if (typeof raw.lastStep !== 'number' || raw.lastStep < 0) raw.lastStep = 0;
    return raw;
  }

  function visitLesson(index, id) {
    var progress = getProgress();
    if (progress.visited.indexOf(id) === -1) progress.visited.push(id);
    progress.lastStep = index;
    writeJson(PROGRESS_KEY, progress);
    return progress;
  }

  function resetProgress() {
    var store = storage();
    if (store) { try { store.removeItem(PROGRESS_KEY); } catch (e) { /* ignore */ } }
    return getProgress();
  }

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------
  function canFetch() {
    if (typeof global.fetch !== 'function') return false;
    var loc = global.location;
    if (!loc || !loc.protocol) return false;
    return loc.protocol === 'http:' || loc.protocol === 'https:';
  }

  function fetchPack(options) {
    options = options || {};
    if (options.loadRemote === false || !canFetch()) return Promise.resolve(null);
    var url = options.url || PACK_URL;
    return global.fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response || !response.ok) return null;
      return response.text();
    }).then(function (text) {
      if (!text) return null;
      var parsed = parsePack(text);
      if (!parsed.ok) return { error: 'tutorial/pack.json could not be loaded: ' + parsed.error };
      return parsed.pack;
    }).catch(function () {
      return null;
    });
  }

  /**
   * Loads the active lesson set.
   * Resolves to { pack, lessons, source, custom, warnings }.
   */
  function load(options) {
    options = options || {};
    var fallback = bundledPack();
    var custom = customLessons();
    return fetchPack(options).then(function (fetched) {
      var warnings = [];
      if (fetched && fetched.error) warnings.push(fetched.error);
      var active = (fetched && !fetched.error) ? fetched : fallback;
      var source = (fetched && !fetched.error)
        ? (options.url || PACK_URL)
        : (fallback.lessons.length ? 'bundled pack (js/tutorial-pack.js)' : 'no pack found');

      var pack = parsePackValue({
        format: active.format, version: active.version, title: active.title,
        description: active.description,
        lessons: active.lessons.concat(custom)
      });
      if (!pack.ok) {
        warnings.push(pack.error);
        var onlyCustom = parsePackValue({ lessons: custom.length ? custom : fallback.lessons });
        return {
          pack: onlyCustom.ok ? onlyCustom.pack : { format: FORMAT, version: '0', title: 'E++ Guided Tutorial', description: '', lessons: [] },
          lessons: onlyCustom.ok ? onlyCustom.pack.lessons : [],
          source: source, custom: custom, warnings: warnings
        };
      }
      return { pack: pack.pack, lessons: pack.pack.lessons, source: source, custom: custom, warnings: warnings };
    });
  }

  EPP.Tutorial = {
    PACK_URL: PACK_URL,
    FORMAT: FORMAT,
    customKey: CUSTOM_KEY,
    progressKey: PROGRESS_KEY,
    bundledPack: bundledPack,
    parsePack: parsePack,
    parsePackValue: parsePackValue,
    validateLesson: validateLesson,
    normaliseLesson: normaliseLesson,
    suggestFileName: suggestFileName,
    load: load,
    customLessons: customLessons,
    addCustomLesson: addCustomLesson,
    removeCustomLesson: removeCustomLesson,
    clearCustomLessons: clearCustomLessons,
    exportPack: exportPack,
    getProgress: getProgress,
    visitLesson: visitLesson,
    resetProgress: resetProgress
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
