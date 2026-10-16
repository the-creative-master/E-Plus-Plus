/**
 * Builds js/settings-schema.js from settings/schema.json.
 *
 * settings/schema.json is the single source of truth for what appears in the
 * IDE's Settings dialog. The IDE fetches that JSON at runtime over http(s);
 * this generated copy is the offline (file://) and no-fetch fallback, so the
 * settings markup is never hardbaked into index.html or js/ide.js.
 *
 * Run: npm run build:settings
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'settings', 'schema.json');
const outPath = join(root, 'js', 'settings-schema.js');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const KNOWN_TYPES = new Set(['select', 'checkbox', 'info', 'actions']);
const KNOWN_EFFECTS = new Set(['theme', 'class', 'class-map', 'css-var']);

const problems = [];
const keys = new Set();
if (schema.format !== 'eplusplus-settings-schema') problems.push('format must be "eplusplus-settings-schema".');
if (!Array.isArray(schema.groups) || schema.groups.length === 0) problems.push('the schema has no groups.');

(schema.groups || []).forEach((group, g) => {
  const where = `Group ${g + 1} (${group.id || '?'})`;
  if (!group.id) problems.push(`${where} needs an id.`);
  if (!group.title) problems.push(`${where} needs a title.`);
  if (!Array.isArray(group.controls) || group.controls.length === 0) problems.push(`${where} has no controls.`);
  (group.controls || []).forEach((control, c) => {
    const label = `${where} control ${c + 1}`;
    if (!KNOWN_TYPES.has(control.type)) { problems.push(`${label}: unknown type "${control.type}".`); return; }
    if (control.type === 'select' || control.type === 'checkbox') {
      if (!control.key) problems.push(`${label} needs a "key".`);
      else if (keys.has(control.key)) problems.push(`${label}: duplicate key "${control.key}".`);
      else keys.add(control.key);
      if (!control.label) problems.push(`${label} needs a "label".`);
      if (control.default === undefined) problems.push(`${label} needs a "default".`);
      if (control.type === 'select') {
        if (!Array.isArray(control.options) || control.options.length === 0) problems.push(`${label} needs "options".`);
        else if (!control.options.some((o) => String(o.value) === String(control.default))) {
          problems.push(`${label}: the default "${control.default}" is not one of the options.`);
        }
        if (typeof control.default === 'number' && !control.options.every((o) => typeof o.value === 'number')) {
          problems.push(`${label}: numeric defaults need numeric option values.`);
        }
      } else if (typeof control.default !== 'boolean') {
        problems.push(`${label}: a checkbox default must be true or false.`);
      }
      if (control.effect && !KNOWN_EFFECTS.has(control.effect.kind)) {
        problems.push(`${label}: unknown effect kind "${control.effect.kind}".`);
      }
    }
    if (control.type === 'info' && !control.text && !control.id) problems.push(`${label}: an info row needs text or an id.`);
    if (control.type === 'actions') {
      if (!Array.isArray(control.buttons) || control.buttons.length === 0) problems.push(`${label} needs "buttons".`);
      (control.buttons || []).forEach((button) => {
        if (!button.id) problems.push(`${label}: a button needs an id.`);
        if (!button.label) problems.push(`${label}: button "${button.id || '?'}" needs a label.`);
        if (!button.action) problems.push(`${label}: button "${button.id || '?'}" needs an action.`);
      });
    }
  });
});

if (problems.length) {
  console.error('settings/schema.json is not valid:\n- ' + problems.join('\n- '));
  process.exit(1);
}

const banner =
  '/*\n' +
  ' * E++ settings schema (generated file — do not edit by hand).\n' +
  ' *\n' +
  ' * Source of truth: settings/schema.json\n' +
  ' * Regenerate with: npm run build:settings\n' +
  ' *\n' +
  ' * The IDE fetches settings/schema.json when it is served over http(s) and\n' +
  ' * falls back to this copy when it is not, so the Settings dialog is always\n' +
  ' * rendered from data — never hardbaked into index.html or js/ide.js.\n' +
  ' */\n';

const body =
  '(function (global) {\n' +
  "  'use strict';\n" +
  '  var EPP = global.EPP || (global.EPP = {});\n' +
  '  EPP.SettingsSchema = ' + JSON.stringify(schema, null, 2) + ';\n' +
  "})(typeof globalThis !== 'undefined' ? globalThis : this);\n";

writeFileSync(outPath, banner + body, 'utf8');

const count = (schema.groups || []).reduce((n, g) => n + (g.controls || []).length, 0);
console.log(`Wrote js/settings-schema.js (${schema.groups.length} groups, ${count} controls, schema version ${schema.version}).`);
