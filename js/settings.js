/*
 * E++ Settings engine (Dev Build 6.1).
 *
 * Project Humanizer — the Settings dialog is NOT hardbaked into index.html or
 * into the IDE controller any more. What appears in Settings is data, defined
 * by the settings schema (settings/schema.json, with the generated
 * js/settings-schema.js as the offline fallback). This module loads and
 * validates that schema, derives the defaults from it, renders the dialog, and
 * applies each setting.
 *
 * A setting declares its own effect, so the IDE never needs a hardcoded list:
 *   { "effect": { "kind": "class",     "class": "wrap-code", "when": "truthy" } }
 *   { "effect": { "kind": "class-map", "classes": { "compact": "console-compact" } } }
 *   { "effect": { "kind": "css-var",   "var": "--code-font-size", "unit": "px" } }
 *   { "effect": { "kind": "theme" } }
 * Settings without an effect (behaviour switches) are read by the IDE itself.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var SCHEMA_URL = 'settings/schema.json';
  var FORMAT = 'eplusplus-settings-schema';
  var STORAGE_KEY = 'eplusplus.settings.v1';

  var KNOWN_TYPES = { select: true, checkbox: true, info: true, actions: true };
  var KNOWN_EFFECTS = { theme: true, class: true, 'class-map': true, 'css-var': true };

  function hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function singular(key) {
    // "consoleHeight" -> "console-height", used for generated element ids.
    return String(key).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  function storage() {
    try {
      if (global.localStorage) return global.localStorage;
    } catch (e) { /* private mode */ }
    return null;
  }

  // ------------------------------------------------------------------
  // Validation — every problem is reported in plain English.
  // ------------------------------------------------------------------
  function validate(schema) {
    var problems = [];
    if (!schema || typeof schema !== 'object') return ['The settings schema is not an object.'];
    if (schema.format !== FORMAT) problems.push('Expected format "' + FORMAT + '".');
    if (!Array.isArray(schema.groups) || schema.groups.length === 0) {
      problems.push('The schema has no groups.');
      return problems;
    }
    var keys = {};
    schema.groups.forEach(function (group, g) {
      var where = 'Group ' + (g + 1) + (group && group.id ? ' (' + group.id + ')' : '');
      if (!group || typeof group !== 'object') { problems.push(where + ' is not an object.'); return; }
      if (!hasValue(group.id)) problems.push(where + ' needs an id.');
      if (!hasValue(group.title)) problems.push(where + ' needs a title.');
      if (!Array.isArray(group.controls) || group.controls.length === 0) {
        problems.push(where + ' has no controls.');
        return;
      }
      group.controls.forEach(function (control, c) {
        var label = where + ', control ' + (c + 1);
        if (!control || typeof control !== 'object') { problems.push(label + ' is not an object.'); return; }
        if (!KNOWN_TYPES[control.type]) { problems.push(label + ': unknown type "' + control.type + '".'); return; }
        if (control.type === 'info') {
          if (!hasValue(control.text) && !hasValue(control.id)) problems.push(label + ': an info row needs text or an id.');
          return;
        }
        if (control.type === 'actions') {
          if (!Array.isArray(control.buttons) || control.buttons.length === 0) { problems.push(label + ' needs buttons.'); return; }
          control.buttons.forEach(function (button) {
            if (!button || !hasValue(button.id)) problems.push(label + ': a button needs an id.');
            else if (!hasValue(button.label)) problems.push(label + ': button "' + button.id + '" needs a label.');
            else if (!hasValue(button.action)) problems.push(label + ': button "' + button.id + '" needs an action.');
          });
          return;
        }
        // select / checkbox
        if (!hasValue(control.key)) { problems.push(label + ' needs a key.'); return; }
        if (keys[control.key]) problems.push(label + ': the key "' + control.key + '" is used twice.');
        keys[control.key] = true;
        if (!hasValue(control.label)) problems.push(label + ' needs a label.');
        if (control.default === undefined) problems.push(label + ' needs a default.');
        if (control.type === 'select') {
          if (!Array.isArray(control.options) || control.options.length === 0) problems.push(label + ' needs options.');
          else {
            if (!control.options.some(function (o) { return String(o.value) === String(control.default); })) {
              problems.push(label + ': the default "' + control.default + '" is not one of its options.');
            }
            var numeric = typeof control.default === 'number';
            control.options.forEach(function (option) {
              if (numeric && typeof option.value !== 'number') problems.push(label + ': numeric defaults need numeric option values.');
              if (!numeric && typeof option.value === 'number') problems.push(label + ': text defaults need text option values.');
            });
          }
        } else if (typeof control.default !== 'boolean') {
          problems.push(label + ': a checkbox default must be true or false.');
        }
        if (control.effect && !KNOWN_EFFECTS[control.effect.kind]) {
          problems.push(label + ': unknown effect kind "' + control.effect.kind + '".');
        }
        if (control.notes !== undefined && (typeof control.notes !== 'object' || control.notes === null)) {
          problems.push(label + ': "notes" must be an object of value -> text.');
        }
      });
    });
    return problems;
  }

  function bundledSchema() {
    return EPP.SettingsSchema || null;
  }

  function parseSchema(text) {
    if (typeof text !== 'string') return { ok: false, error: 'A settings schema must be JSON text.' };
    var value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That settings schema is not valid JSON: ' + e.message };
    }
    return parseSchemaValue(value);
  }

  function parseSchemaValue(value) {
    var problems = validate(value);
    if (problems.length) return { ok: false, error: problems.join('\n'), problems: problems };
    return { ok: true, schema: value };
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

  function fetchSchema(options) {
    options = options || {};
    if (options.loadRemote === false || !canFetch()) return Promise.resolve(null);
    var url = options.url || SCHEMA_URL;
    return global.fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response || !response.ok) return null;
      return response.text();
    }).then(function (text) {
      if (!text) return null;
      var parsed = parseSchema(text);
      if (!parsed.ok) return { error: url + ' could not be loaded: ' + parsed.error };
      return parsed.schema;
    }).catch(function () {
      return null;
    });
  }

  /**
   * Loads the active settings schema.
   * Resolves to { schema, source, warnings }.
   */
  function load(options) {
    options = options || {};
    return fetchSchema(options).then(function (fetched) {
      var warnings = [];
      var schema = fetched;
      var source = options.url || SCHEMA_URL;
      if (fetched && fetched.error) warnings.push(fetched.error);
      if (!fetched || fetched.error) {
        schema = bundledSchema();
        source = schema ? 'bundled schema (js/settings-schema.js)' : 'no schema found';
      }
      if (!schema) {
        return { schema: { format: FORMAT, version: '0', title: 'Settings', groups: [] }, source: source, warnings: warnings };
      }
      var problems = validate(schema);
      if (problems.length) {
        warnings.push('The settings schema was rejected:\n' + problems.join('\n'));
        var fallback = bundledSchema();
        if (fallback && validate(fallback).length === 0) {
          return { schema: fallback, source: 'bundled schema (js/settings-schema.js)', warnings: warnings };
        }
        return { schema: { format: FORMAT, version: '0', title: 'Settings', groups: [] }, source: source, warnings: warnings };
      }
      return { schema: schema, source: source, warnings: warnings };
    });
  }

  // ------------------------------------------------------------------
  // Helpers used by the IDE
  // ------------------------------------------------------------------
  function groups(schema) {
    return (schema && Array.isArray(schema.groups)) ? schema.groups : [];
  }

  function controls(schema) {
    var list = [];
    groups(schema).forEach(function (group) {
      (group.controls || []).forEach(function (control) { list.push(control); });
    });
    return list;
  }

  /** Builds { key: default } from the schema — the defaults are data too. */
  function defaults(schema) {
    var value = {};
    controls(schema).forEach(function (control) {
      if (control.key && (control.type === 'select' || control.type === 'checkbox')) {
        value[control.key] = control.default;
      }
    });
    return value;
  }

  function settingsKey(schema) {
    return hasValue(schema && schema.storageKey) ? schema.storageKey : STORAGE_KEY;
  }

  /** Coerces a value to the type the schema declares for that key. */
  function coerce(schema, key, value) {
    var found = null;
    controls(schema).forEach(function (control) { if (control.key === key) found = control; });
    if (!found) return value;
    if (typeof found.default === 'number') return Number(value);
    if (typeof found.default === 'boolean') return value === true || value === 'true';
    return String(value);
  }

  /** Merges stored values with the schema defaults, ignoring unknown keys. */
  function mergeStored(schema, stored) {
    var value = defaults(schema);
    if (!stored || typeof stored !== 'object') return value;
    Object.keys(value).forEach(function (key) {
      if (stored[key] !== undefined && stored[key] !== null && typeof stored[key] === typeof value[key]) {
        value[key] = stored[key];
      }
    });
    return value;
  }

  var STATE_CLASSES = ['compact-ui', 'hide-dashboard', 'hide-line-numbers', 'wrap-code',
    'hide-libraries-panel', 'hide-help-panel', 'console-compact', 'console-tall'];

  /**
   * Applies every setting to the document, driven purely by the schema's
   * "effect" declarations.
   */
  function applyAll(settings, schema, doc) {
    doc = doc || global.document;
    if (!doc) return;
    var body = doc.body;
    if (!body) return;
    STATE_CLASSES.forEach(function (name) { body.classList.remove(name); });
    body.classList.remove('light-theme');

    controls(schema).forEach(function (control) {
      if (!control.key || !control.effect) return;
      var value = settings[control.key];
      var effect = control.effect;
      if (effect.kind === 'theme') {
        var light = value === 'light' || (value === 'system' && matchSystemLight());
        body.classList.toggle('light-theme', !!light);
        return;
      }
      if (effect.kind === 'class' && effect['class']) {
        var on = effect.when === 'truthy' ? !!value : !value;
        body.classList.toggle(effect['class'], !!on);
        return;
      }
      if (effect.kind === 'class-map' && effect.classes) {
        var chosen = effect.classes[String(value)];
        if (chosen) body.classList.add(chosen);
        return;
      }
      if (effect.kind === 'css-var' && effect.var) {
        body.style.setProperty(effect.var, String(value) + (effect.unit || ''));
      }
    });
  }

  var systemThemeQuery = null;
  function matchSystemLight() {
    if (!global.matchMedia) return false;
    if (!systemThemeQuery) systemThemeQuery = global.matchMedia('(prefers-color-scheme: light)');
    return !!systemThemeQuery.matches;
  }

  /**
   * Fills the schema-declared description element for a control, replacing
   * {system} with the current system theme. The text itself is data.
   */
  function applyNotes(schema, key, value, doc) {
    doc = doc || global.document;
    if (!doc) return;
    var found = null;
    controls(schema).forEach(function (control) { if (control.key === key) found = control; });
    if (!found || !found.descriptionId || !found.notes) return;
    var el = doc.getElementById(found.descriptionId);
    if (!el) return;
    var text = found.notes[String(value)];
    if (text === undefined) return;
    el.textContent = String(text).replace('{system}', matchSystemLight() ? 'light' : 'dark');
  }

  EPP.Settings = {
    SCHEMA_URL: SCHEMA_URL,
    applyNotes: applyNotes,
    FORMAT: FORMAT,
    storageKey: STORAGE_KEY,
    load: load,
    parseSchema: parseSchema,
    parseSchemaValue: parseSchemaValue,
    validate: validate,
    bundledSchema: bundledSchema,
    groups: groups,
    controls: controls,
    defaults: defaults,
    settingsKey: settingsKey,
    coerce: coerce,
    mergeStored: mergeStored,
    applyAll: applyAll,
    elementId: singular,
    matchSystemLight: matchSystemLight
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
