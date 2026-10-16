// Browser-side checks: the real pages, the real script, the real server.
//
//   node tests/front_end.mjs
//
// jsdom is the only dependency and it is not needed for anything else, so when
// it is missing this says so and leaves the rest of the suite alone:
//
//   npm install jsdom

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch (problem) {
  console.log('  jsdom is not installed, so the page-level checks were skipped.');
  console.log('  (npm install jsdom, then run this again)');
  if (process.env.DEBUG_IMPORT) console.log('  ' + problem.message);
  process.exit(0);
}

const PORT = process.env.PORT || 8793;
const BASE = `http://127.0.0.1:${PORT}`;
const workspace = mkdtempSync(join(tmpdir(), 'epp-ui-'));
const server = spawn('./build/epp', ['serve', '--port', String(PORT), '--workspace', workspace],
                     { stdio: 'ignore' });

let pass = 0;
let failed = 0;
function ok(label) { pass++; console.log(`  ok   ${label}`); }
function bad(label, extra) { failed++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
function check(label, condition, extra) { condition ? ok(label) : bad(label, extra); }

const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  let up = false;
  for (let i = 0; i < 60 && !up; ++i) {
    up = await fetch(`${BASE}/api/status`).then(r => r.ok).catch(() => false);
    if (!up) await wait(120);
  }
  if (!up) throw new Error('the server never came up');

  const labels = await fetch(`${BASE}/api/labels`).then(r => r.json());
  const appSource = await fetch(`${BASE}/app.js`).then(r => r.text());

  // A brand new workspace opens the tutorial first, the way a person sees it.
  const first = await fetch(`${BASE}/`);
  check('a first visit lands on the tutorial', first.url.endsWith('/tutorial'), first.url);
  await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'theme=dark&density=comfortable&fontSize=14'
  });

  const load = async (path) => {
    const html = await fetch(BASE + path).then(r => r.text());
    const errors = [];
    const console_ = new VirtualConsole();
    console_.on('jsdomError', e => errors.push(e.message));
    console_.on('error', e => errors.push(String(e)));
    const dom = new JSDOM(html, { url: BASE + path, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console_ });
    const window = dom.window;
    window.fetch = (url, options) => fetch(new URL(url, BASE), options);
    window.confirm = () => true;
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function (value) {
      this.open = false;
      this.returnValue = value;
      this.dispatchEvent(new window.Event('close'));
    };
    window.document.documentElement.setAttribute('data-confirm', 'off');
    window.eval(appSource);
    await wait(450);
    return { window, errors };
  };

  console.log('the IDE in a browser-shaped hole');
  const { window, errors } = await load('/');
  const $ = sel => window.document.querySelector(sel);
  const toasts = () => [...window.document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ');

  check('the page boots without an error', errors.length === 0, errors.join(' | '));
  check('the wording comes from /api/labels', window.document.title.includes('E++') && labels['ui.run'] === 'Run');

  const rows = [...window.document.querySelectorAll('.file-row')];
  check('the file list arrives from the server', rows.length > 0, String(rows.length));

  rows[0].querySelector('.file-open').click();
  await wait(500);
  const code = $('#code');
  check('opening a file fills the editor', code.value.length > 0, JSON.stringify(code.value.slice(0, 40)));
  check('the highlight layer arrives with it', $('#highlight').innerHTML.includes('class="ln"'));
  check('the file name shows in the status bar', $('#status-file').textContent === $('#field-file').value);

  code.value = 'note: typed in a browser\nsay "front end says hello"';
  code.dispatchEvent(new window.Event('input'));
  await wait(400);
  check('typing re-colours the code', $('#highlight').innerHTML.includes('t-note'));

  $('#run-button').click();
  await wait(600);
  check('Run prints what the program said', $('#console').textContent.includes('front end says hello'),
        $('#console').textContent.slice(0, 120) + ' | toasts: ' + toasts());
  check('the run is reported on the status bar', ($('#status-run').textContent || '').includes('ms'));

  $('#save-button').click();
  await wait(700);
  check('Save settles the editor', $('#editor-state').textContent.length > 0, toasts());

  $('#new-file').click();
  await wait(120);
  $('#prompt-input').value = 'from-a-test';
  $('#prompt-dialog').close('ok');
  await wait(700);
  check('a new file lands in the list', $('.file-list').innerHTML.includes('from-a-test'), toasts());
  check('and becomes the file being edited', $('#field-file').value === 'from-a-test.eppl', $('#field-file').value);

  const card = $('.insert-library');
  const library = card.getAttribute('data-library');
  card.click();
  await wait(700);
  check('inserting a library writes the line', code.value.startsWith(`add library "${library}"`),
        JSON.stringify(code.value.slice(0, 50)) + ' | toasts: ' + toasts());
  check('and the file earns the longer ending', $('#field-file').value.endsWith('.eppla'), $('#field-file').value);
  check('the library card shows it is loaded', $('.card .state').textContent.length > 0, $('.card .state').textContent);

  $('#run-button').click();
  await wait(600);
  check('the library file runs too', $('#console').textContent.includes('▶'), $('#console').textContent.slice(0, 80));

  $('#filter').value = 'from-a-test';
  $('#filter').dispatchEvent(new window.Event('input'));
  await wait(120);
  const hidden = [...window.document.querySelectorAll('.file-row')].filter(r => r.classList.contains('filtered')).length;
  check('the filter hides what does not match', hidden > 0, 'hidden=' + hidden);

  $('#rename-button').click();
  await wait(120);
  $('#prompt-input').value = 'renamed-by-a-test.eppl';
  $('#prompt-dialog').close('ok');
  await wait(700);
  check('renaming moves the file', $('#field-file').value === 'renamed-by-a-test.eppl', $('#field-file').value + ' | ' + toasts());

  $('#delete-button').click();
  await wait(700);
  check('deleting takes it out of the list', !$('.file-list').innerHTML.includes('renamed-by-a-test'), toasts());
  check('the page survives all of that', errors.length === 0, errors.join(' | '));

  console.log('the settings page in the same hole');
  const settings = await load('/settings');
  const s = settings.window;
  const form = s.document.querySelector('.settings-panel form');
  s.document.querySelector('select[name="theme"]').value = 'light';
  form.dispatchEvent(new s.Event('submit', { cancelable: true, bubbles: true }));
  await wait(600);
  check('saving settings restyles the page in place', s.document.documentElement.className.includes('light'),
        s.document.documentElement.className);
  await fetch(`${BASE}/settings/reset`, { method: 'POST' });

  console.log('the tutorial page in the same hole');
  const tutorial = await load('/tutorial');
  const lessons = JSON.parse(readFileSync('data/tutorial.json', 'utf8')).length;
  const listed = tutorial.window.document.querySelectorAll('.lesson-item a').length;
  check('the lesson list matches data/tutorial.json', listed === lessons, `${listed} listed, ${lessons} in the data`);
} catch (problem) {
  bad('the browser-side checks could not run', String(problem && problem.message || problem));
} finally {
  server.kill();
  rmSync(workspace, { recursive: true, force: true });
}

console.log(`\n${pass} browser-side checks passed${failed ? `, ${failed} failed.` : '.'}`);
process.exit(failed ? 1 : 0);
