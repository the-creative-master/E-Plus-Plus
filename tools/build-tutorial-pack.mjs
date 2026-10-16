/**
 * Builds js/tutorial-pack.js from tutorial/pack.json.
 *
 * tutorial/pack.json is the single source of truth for tutorial content.
 * The IDE loads that JSON at runtime over http(s); this generated copy is the
 * offline (file://) and no-fetch fallback, so the lesson content is still not
 * baked into the IDE application code.
 *
 * Run: npm run build:tutorial
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packPath = join(root, 'tutorial', 'pack.json');
const outPath = join(root, 'js', 'tutorial-pack.js');

const pack = JSON.parse(readFileSync(packPath, 'utf8'));

if (!pack || !Array.isArray(pack.lessons) || pack.lessons.length === 0) {
  throw new Error('tutorial/pack.json has no lessons.');
}

const seen = new Set();
for (const lesson of pack.lessons) {
  for (const field of ['id', 'title', 'badge', 'summary', 'explanation', 'code']) {
    if (typeof lesson[field] !== 'string' || lesson[field].length === 0) {
      throw new Error(`Lesson "${lesson.id || '?'}" is missing a ${field}.`);
    }
  }
  if (seen.has(lesson.id)) throw new Error(`Duplicate lesson id "${lesson.id}".`);
  seen.add(lesson.id);
}

const banner =
  '/*\n' +
  ' * E++ tutorial lesson pack (generated file — do not edit by hand).\n' +
  ' *\n' +
  ' * Source of truth: tutorial/pack.json\n' +
  ' * Regenerate with: npm run build:tutorial\n' +
  ' *\n' +
  ' * The IDE loads tutorial/pack.json when it is served over http(s) and\n' +
  ' * falls back to this copy when it is not, so lesson content always lives\n' +
  ' * outside the IDE application code.\n' +
  ' */\n';

const body =
  '(function (global) {\n' +
  "  'use strict';\n" +
  '  var EPP = global.EPP || (global.EPP = {});\n' +
  '  EPP.TutorialPack = ' + JSON.stringify(pack, null, 2) + ';\n' +
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';

writeFileSync(outPath, banner + body, 'utf8');
console.log(`Wrote js/tutorial-pack.js (${pack.lessons.length} lessons, pack version ${pack.version}).`);
