/**
 * Builds js/ui-shell.js from ui/manifest.json.
 *
 * ui/manifest.json is the single source of truth for the IDE's interface.
 * index.html ships an empty #appRoot and js/shell.js builds the chrome from
 * the manifest at runtime; this generated copy is the offline (file://) and
 * no-fetch fallback, so the interface is never hardbaked into index.html.
 *
 * The tool also checks the manifest against the ids the IDE's controller looks
 * up, so a renamed or missing control is a build error rather than a dead
 * button. Run: npm run build:ui
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'ui', 'manifest.json');
const shellPath = join(root, 'js', 'shell.js');
const outPath = join(root, 'js', 'ui-shell.js');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Load js/shell.js to reuse its validator and its list of required ids.
const context = vm.createContext({ console, JSON, Object, Array, String, Number, RegExp, Math, Error });
context.globalThis = context;
vm.runInContext(readFileSync(shellPath, 'utf8'), context, { filename: 'shell.js' });
const Shell = context.EPP.Shell;

const problems = Shell.validate(manifest);
if (problems.length) {
  console.error('ui/manifest.json is not valid:\n- ' + problems.join('\n- '));
  process.exit(1);
}

// Every id js/ide.js looks up must exist in the manifest.
const controller = readFileSync(join(root, 'js', 'ide.js'), 'utf8');
const lookups = new Set();
for (const match of controller.matchAll(/\$\('([^']+)'\)/g)) lookups.add(match[1]);
const ids = new Set();
(function walk(node) {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'id' || /Id$/.test(key)) && typeof value === 'string' && value) ids.add(value);
    else walk(value);
  }
})(manifest);

// Elements created by another data file (the settings schema's info rows and
// the notes it targets) count as well.
const schemaPath = join(root, 'settings', 'schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
for (const group of schema.groups) {
  for (const control of group.controls) {
    if (control.id) ids.add(control.id);
    if (control.descriptionId) ids.add(control.descriptionId);
  }
}

const missing = [...lookups].filter((id) => !ids.has(id));
if (missing.length) {
  console.error('js/ide.js looks up elements the manifest does not create:\n- ' + missing.join('\n- '));
  process.exit(1);
}

const banner =
  '/*\n' +
  ' * E++ UI manifest (generated file — do not edit by hand).\n' +
  ' *\n' +
  ' * Source of truth: ui/manifest.json\n' +
  ' * Regenerate with: npm run build:ui\n' +
  ' *\n' +
  ' * The IDE fetches ui/manifest.json when it is served over http(s) and falls\n' +
  ' * back to this copy when it is not, so the interface is always built from\n' +
  ' * data — never hardbaked into index.html.\n' +
  ' */\n';

const body =
  '(function (global) {\n' +
  "  'use strict';\n" +
  '  var EPP = global.EPP || (global.EPP = {});\n' +
  '  EPP.UiShell = ' + JSON.stringify(manifest, null, 2) + ';\n' +
  "})(typeof globalThis !== 'undefined' ? globalThis : this);\n";

writeFileSync(outPath, banner + body, 'utf8');

const buttons = JSON.stringify(manifest).match(/"label"/g) || [];
console.log(`Wrote js/ui-shell.js (manifest ${manifest.version}: ${ids.size} element ids, ${buttons.length} labels, all ${lookups.size} ids js/ide.js needs are present).`);
