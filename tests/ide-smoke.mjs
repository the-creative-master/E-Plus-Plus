/**
 * IDE smoke test for E++ Dev Build 6.1.
 *
 * Boots the real index.html in jsdom against a local static server and checks
 * the things that unit tests cannot see: that the IDE boots without errors,
 * that the tutorial is rendered from the external lesson pack, that "Try in
 * editor" never overwrites the open file, that settings apply, and that
 * running a program works.
 *
 * jsdom is optional tooling, not a shipped dependency:
 *   npm install --no-save jsdom && npm run test:ide
 *
 * Without jsdom installed the script explains itself and exits 0, so
 * `npm test` stays green on a bare checkout.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
let VirtualConsole;
try {
  // jsdom is CommonJS; pick the pieces up whichever way Node exposes them.
  const mod = await import('jsdom');
  const api = mod.JSDOM ? mod : (mod.default || {});
  JSDOM = api.JSDOM;
  VirtualConsole = api.VirtualConsole;
} catch (e) {
  JSDOM = null;
}
if (!JSDOM) {
  console.log('IDE smoke test skipped: jsdom is not installed.');
  console.log('Install it with:  npm install --no-save jsdom   (then run: npm run test:ide)');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.eppl': 'text/plain', '.eppla': 'text/plain'
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname)).replace(/^\/+/, '');
  const file = join(root, path || 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end('error');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push('[jsdomError] ' + (e.message || e)));
virtualConsole.on('error', (...a) => errors.push('[console.error] ' + a.join(' ')));

const dom = await JSDOM.fromURL(base + 'index.html', {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.fetch = (input, init) => fetch(new URL(input, base).href, init);
    // jsdom has no confirm(); the IDE asks before deleting or resetting.
    window.confirm = () => true;
    window.matchMedia = window.matchMedia || function (query) {
      return { matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    };
    if (window.HTMLDialogElement && !window.HTMLDialogElement.prototype.showModal) {
      window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    }
    window.addEventListener('error', (e) => errors.push('[window.onerror] ' + (e.message || e)));
  }
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const failures = [];
function check(name, condition, extra = '') {
  if (condition) { passed += 1; console.log('  ✓ ' + name); return; }
  failures.push(name);
  console.log('  ✗ ' + name + (extra ? '  ' + extra : ''));
}

await new Promise((resolve) => window.addEventListener('load', resolve));
await wait(1500);

console.log('IDE boot');
check('no page errors while booting', errors.length === 0, errors.join(' | '));
check('example files are listed', doc.querySelectorAll('#fileList .file-row').length >= 10);
check('hello.eppl opens on the first run', /hello\.eppl/.test(doc.getElementById('currentFileName').textContent));

console.log('Tutorial comes from the lesson pack');
const packSource = doc.getElementById('tutSource').textContent;
check('the pack is fetched from tutorial/pack.json', packSource.includes('tutorial/pack.json'), packSource);
check('the lesson rail is rendered from the pack', doc.querySelectorAll('#tutLessonList .tut-lesson').length === 10,
  String(doc.querySelectorAll('#tutLessonList .tut-lesson').length));
check('lesson 1 content comes from the pack', /Welcome to E\+\+ \(Dev Build 6\.1\)/.test(doc.getElementById('tutTitle').textContent));
check('the lesson footer names the scratch file', /tutorial-welcome\.eppl/.test(doc.getElementById('tutStepCount').textContent),
  doc.getElementById('tutStepCount').textContent);

doc.getElementById('tutNext').click();
await wait(60);
check('Next advances the lesson', /Variables & Quotes/.test(doc.getElementById('tutTitle').textContent));
check('visited lessons are ticked', doc.querySelectorAll('#tutLessonList .tut-lesson.visited').length >= 1);
check('progress is stored', /welcome/.test(window.localStorage.getItem('eplusplus.tutorial.progress.v1') || ''));

const helloBefore = window.localStorage.getItem('eplusplus.files.v1');
doc.getElementById('tutTry').click();
await wait(400);
const files = JSON.parse(window.localStorage.getItem('eplusplus.files.v1'));
check('"Try in editor" opens its own tutorial file', /^tutorial-variables\.eppl$/.test(doc.getElementById('currentFileName').textContent),
  doc.getElementById('currentFileName').textContent);
check('the file that was open is untouched', helloBefore && typeof files['hello.eppl'] === 'object');

console.log('Settings');
const themeSelect = doc.getElementById('themeSelect');
themeSelect.value = 'light';
themeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
check('theme applies (light)', doc.body.classList.contains('light-theme'));
themeSelect.value = 'dark';
themeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

const dashboardToggle = doc.getElementById('showDashboardToggle');
dashboardToggle.checked = false;
dashboardToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
check('dashboard can be hidden', doc.body.classList.contains('hide-dashboard'));

const fontSelect = doc.getElementById('fontSizeSelect');
fontSelect.value = '18';
fontSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
check('editor font size drives --code-font-size', doc.body.style.getPropertyValue('--code-font-size') === '18px',
  doc.body.style.getPropertyValue('--code-font-size'));

const densitySelect = doc.getElementById('densitySelect');
densitySelect.value = 'compact';
densitySelect.dispatchEvent(new window.Event('change', { bubbles: true }));
const heightSelect = doc.getElementById('consoleHeightSelect');
heightSelect.value = 'tall';
heightSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
const wrapToggle = doc.getElementById('wordWrapToggle');
wrapToggle.checked = true;
wrapToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
check('layout settings apply (compact, tall console, wrap)',
  doc.body.classList.contains('compact-ui') && doc.body.classList.contains('console-tall') && doc.body.classList.contains('wrap-code'));
check('settings are persisted', /"editorFontSize":18/.test(window.localStorage.getItem('eplusplus.settings.v1') || ''),
  window.localStorage.getItem('eplusplus.settings.v1'));

console.log('Lesson packs are editable');
doc.getElementById('tutSaveLesson').click();
await wait(120);
const dialog = doc.getElementById('fileDialog');
check('the lesson-name dialog opens in plain-text mode', dialog.open === true &&
  doc.getElementById('fileDialogInput').placeholder === 'My own lesson',
  doc.getElementById('fileDialogInput').placeholder);
doc.getElementById('fileDialogInput').value = 'My smoke lesson';
doc.getElementById('fileDialogForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(400);
const pack = JSON.parse(window.localStorage.getItem('eplusplus.tutorial.custom.v1') || '[]');
check('saving the editor as a lesson writes to the custom pack', pack.length === 1 && pack[0].title === 'My smoke lesson',
  JSON.stringify(pack).slice(0, 120));
check('the custom lesson joins the rail', doc.querySelectorAll('#tutLessonList .tut-lesson.custom').length === 1);
doc.getElementById('tutResetPack').click();
await wait(400);
check('reset clears custom lessons and progress',
  (window.localStorage.getItem('eplusplus.tutorial.custom.v1') || '[]') === '[]' &&
  doc.querySelectorAll('#tutLessonList .tut-lesson.custom').length === 0);

console.log('Running code');
const editor = doc.getElementById('editor');
editor.value = 'say "smoke test says hello"\nsay 6 times 7\n';
editor.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('btnRun').click();
await wait(800);
const consoleText = doc.getElementById('consoleOutput').textContent;
check('program output reaches the console', /smoke test says hello/.test(consoleText) && /42/.test(consoleText), consoleText.slice(-160));
check('the run reports Finished', /Finished/.test(doc.getElementById('statusRun').textContent), doc.getElementById('statusRun').textContent);

editor.value = 'add library "Math"\nsay square root of 9\n';
editor.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(700);
check('a library upgrade renames the file to .eppla',
  doc.getElementById('currentFileName').textContent.endsWith('.eppla'),
  doc.getElementById('currentFileName').textContent);
check('the tab shows the new .eppla name',
  doc.getElementById('currentFileName').textContent === doc.getElementById('statusFile').textContent.replace(' (.eppla)', ''));

check('still no page errors at the end', errors.length === 0, errors.join(' | '));

server.close();
console.log('\n' + (passed + failures.length === passed ? '' : '') + passed + '/' + (passed + failures.length) + ' IDE smoke checks passed.');
if (failures.length) {
  console.log('Failed: ' + failures.join('; '));
  process.exit(1);
}
