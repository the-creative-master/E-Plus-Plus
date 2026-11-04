/**
 * Generate the E++ News screenshots.
 *
 * There is no browser in this environment, so these are drawn to SVG from the
 * same design tokens and markup the Studio actually uses (css/studio.css
 * :root, the activity rail, the sidebar tabs, the editor metrics), then
 * rasterised with resvg via sharp. One image per caption in news.html.
 *
 * Run: npm i --no-save sharp && node tools/make-news-shots.mjs
 * (sharp is not a project dependency; it is only needed to regenerate these.)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'assets');
mkdirSync(OUT, { recursive: true });

const W = 1440;
const H = 900;
const MONO = 'DejaVu Sans Mono, Menlo, monospace';
const SANS = 'DejaVu Sans, Inter, sans-serif';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// tokens (css/studio.css :root)
// ---------------------------------------------------------------------------
const T = {
  bg: '#0b0d18',
  top: '#191a2a',
  rail: '#1b1a2b',
  railEdge: '#ffffff18',
  side: '#191a28',
  panel: '#151624',
  panel2: '#1b1d2c',
  border: '#2d3046',
  text: '#edeef6',
  muted: '#9595ac',
  faint: '#6f6c85',
  accent: '#b7a4ff',
  accentDim: '#7f74b8',
  green: '#79d9a8',
  amber: '#f2c46b',
  red: '#ff8998',
  blue: '#8fb8ff',
};

// ---------------------------------------------------------------------------
// small drawing helpers
// ---------------------------------------------------------------------------
const rect = (x, y, w, h, fill, r = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`;
const text = (x, y, s, opts = {}) => {
  const { size = 13, fill = T.text, font = SANS, weight = 400, anchor = 'start', spacing = 0, opacity = 1 } = opts;
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}"` +
    ` fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" opacity="${opacity}">${esc(s)}</text>`;
};

/** A tokenised line of E++: notes grey, strings green, keywords purple, numbers amber. */
const EPP_WORDS = new RegExp('\\b(?:say|let|set|define|if|then|otherwise|end|repeat|times|while|do|add|library|' +
  'the|ask|and|save|answer|as|create|actor|with|image|play|game|stop|wait|seconds|increase|decrease|by|' +
  'plus|minus|divided|modulo|is|equals|equal|to|greater|less|than|not|number|run|python|code|file|write)\\b', 'g');

function tokenize(source) {
  const out = [];
  const re = new RegExp('(note \\[[^\\]]*\\]|"[^"]*"|\'[^\']*\'|' + EPP_WORDS.source + '|\\b\\d+(?:\\.\\d+)?\\b)', 'g');
  let last = 0;
  let m;
  while ((m = re.exec(source))) {
    if (m.index > last) out.push([source.slice(last, m.index), T.text]);
    const tok = m[0];
    let fill = T.text;
    if (tok.startsWith('note [')) fill = '#6f7288';
    else if (tok.startsWith('"')) fill = T.green;
    else if (tok.startsWith("'")) fill = T.blue;
    else if (/^\d/.test(tok)) fill = T.amber;
    else fill = T.accent;
    out.push([tok, fill]);
    last = m.index + tok.length;
  }
  if (last < source.length) out.push([source.slice(last), T.text]);
  return out;
}

function code(x, y, source, size = 13) {
  const cell = size * 0.602; // DejaVu Sans Mono advance width
  let cx = x;
  return tokenize(source).map(([tok, fill]) => {
    const piece = text(cx, y, tok, { font: MONO, size, fill });
    cx += tok.length * cell;
    return piece;
  }).join('');
}

const measure = (s) => s.length; // monospace: one character is one cell
const wrap = (str, maxChars) => {
  const out = [];
  let row = '';
  for (const word of String(str).split(' ')) {
    if ((row + ' ' + word).trim().length > maxChars) { if (row) out.push(row.trim()); row = word; }
    else row += ' ' + word;
  }
  if (row.trim()) out.push(row.trim());
  return out;
};

// ---------------------------------------------------------------------------
// Chrome: the top bar, the activity rail and the status bar
// ---------------------------------------------------------------------------
function topbar(version, saved = 'Saved locally') {
  let s = rect(0, 0, W, 52, T.top);
  s += line(0, 52, W, 52, '#ffffff10');
  s += rect(16, 12, 28, 28, T.accent, 8);
  s += text(30, 31, 'E', { size: 15, weight: 700, fill: '#1a1730', anchor: 'middle' });
  s += text(54, 32, 'E++ Studio', { size: 14, weight: 700 });
  s += rect(54 + 92, 17, 44, 19, '#ffffff14', 10);
  s += text(54 + 92 + 22, 30, version, { size: 10, weight: 700, fill: T.accent, anchor: 'middle' });
  // right side
  s += `<circle cx="${W - 372}" cy="26" r="4" fill="${T.green}"/>`;
  s += text(W - 360, 30, saved, { size: 12, fill: T.muted });
  s += rect(W - 258, 14, 74, 24, '#ffffff10', 7);
  s += text(W - 221, 30, '≡  Tools', { size: 12, fill: T.text, anchor: 'middle' });
  s += rect(W - 172, 13, 158, 26, T.accent, 8);
  s += text(W - 93, 30, '▸  Run code', { size: 12, weight: 700, fill: '#1a1730', anchor: 'middle' });
  return s;
}

const RAIL_ICONS = {
  files: '<path d="M4 6.5h6l2 2h8a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1.5 1.5 0 0 1 1-1.5Z"/>',
  libraries: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3-1 3 15-3 1z"/>',
  guide: '<path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1zM20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z"/>',
  learn: '<path d="m3 9 9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5M21 9v7"/>',
  settings: '<path d="m10 3-.5 2.2-2 .9-2-1.2-2 3.4 1.7 1.5v2.4l-1.7 1.5 2 3.4 2-1.2 2 .9L10 21h4l.5-2.2 2-.9 2 1.2 2-3.4-1.7-1.5V9.8l1.7-1.5-2-3.4-2 1.2-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
  customize: '<path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
};

const RAIL = [
  ['group', 'Panels'],
  ['files', 'Files'],
  ['libraries', 'Libraries'],
  ['guide', 'Reference'],
  ['group', 'Help'],
  ['learn', 'Learn'],
  ['settings', 'Settings'],
  ['group', 'More'],
  ['customize', 'Customize'],
];

function rail(version, active) {
  const width = 84;
  let s = rect(0, 52, width, H - 52 - 26, T.rail);
  s += line(width, 52, width, H - 26, T.railEdge);
  let y = 62;
  for (const [key, label] of RAIL) {
    if (key === 'group') {
      s += text(width / 2, y + 10, label, { size: 8, weight: 800, fill: T.faint, anchor: 'middle', spacing: 1.6 });
      y += 20;
      continue;
    }
    const isActive = key === active;
    if (isActive) {
      s += rect(0, y, width, 50, '#ffffff0d');
      s += rect(0, y + 6, 3, 38, T.accent, 2);
    }
    const colour = isActive ? '#f0eaff' : '#9390a8';
    s += `<g transform="translate(${width / 2 - 10},${y + 7})" fill="none" stroke="${colour}" stroke-width="1.5"` +
      ` stroke-linecap="round" stroke-linejoin="round"><svg width="20" height="20" viewBox="0 0 24 24">${RAIL_ICONS[key]}</svg></g>`;
    s += text(width / 2, y + 43, label, { size: 9, weight: 700, fill: colour, anchor: 'middle' });
    y += 53;
  }
  return s;
}

function statusbar(left = 'E++ STUDIO', right = 'Updated Daily') {
  let s = rect(0, H - 26, W, 26, '#12121f');
  s += line(0, H - 26, W, H - 26, '#ffffff10');
  s += text(14, H - 9, left, { size: 10, weight: 700, fill: T.muted, spacing: 1 });
  s += text(W - 14, H - 9, right, { size: 10, fill: T.accent, anchor: 'end' });
  return s;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
const RAIL_EDGE = 84;
const SIDEBAR_W = 232;

function sidebarActive(version, activeTab = 'Files', content = null) {
  const x = RAIL_EDGE;
  let s = rect(x, 52, SIDEBAR_W, H - 52 - 26, T.side);
  s += line(x + SIDEBAR_W, 52, x + SIDEBAR_W, H - 26, '#ffffff12');
  s += text(x + 14, 76, 'YOUR CREATIVE SPACE', { size: 8, weight: 800, fill: T.faint, spacing: 1.5 });
  s += text(x + 14, 96, 'Workspace', { size: 13, weight: 700 });
  s += `<circle cx="${x + SIDEBAR_W - 44}" cy="90" r="3" fill="${T.green}"/>`;
  s += text(x + SIDEBAR_W - 36, 94, 'Local', { size: 10, fill: T.muted });

  // project summary card
  s += rect(x + 12, 108, SIDEBAR_W - 24, 56, '#22243a', 9, `stroke="#ffffff10"`);
  s += rect(x + 22, 118, 34, 34, '#2c2f4a', 8);
  s += text(x + 39, 141, '✳', { size: 16, fill: T.accent, anchor: 'middle' });
  s += text(x + 66, 128, 'PROJECT COLLECTION', { size: 7.5, weight: 800, fill: T.faint, spacing: 1.2 });
  s += text(x + 66, 143, '8 files', { size: 12, weight: 700 });
  s += text(x + 66, 155, 'Saved on this device', { size: 9, fill: T.muted });

  // tabs
  const tabs = [['Files', activeTab === 'Files'], ['Libraries', activeTab === 'Libraries'], ['Reference', activeTab === 'Reference']];
  const tw = (SIDEBAR_W - 20) / 3;
  tabs.forEach(([label, on], i) => {
    const tx = x + 10 + i * tw;
    s += text(tx + tw / 2, 196, label, { size: 10.5, weight: 700, fill: on ? '#e5dcff' : '#a4a6b8', anchor: 'middle' });
    if (on) s += rect(tx + 12, 204, tw - 24, 3, T.accent, 2);
  });
  s += line(x + 10, 206, x + SIDEBAR_W - 10, 206, '#2d3046');

  if (activeTab !== 'Files' && content) {
    s += content(x + 14, 232, SIDEBAR_W - 28);
    void version;
    return s;
  }
  s += text(x + 14, 228, 'YOUR FILES', { size: 8, weight: 800, fill: T.faint, spacing: 1.4 });
  s += rect(x + SIDEBAR_W - 62, 216, 48, 20, T.accent, 6);
  s += text(x + SIDEBAR_W - 38, 230, '+ New', { size: 10, weight: 700, fill: '#1a1730', anchor: 'middle' });

  // search
  s += rect(x + 12, 244, SIDEBAR_W - 24, 28, '#212537', 8, `stroke="#383d51"`);
  s += `<g transform="translate(${x + 22},252)" fill="none" stroke="#8d92a8" stroke-width="1.6"><svg width="14" height="14" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4"/></svg></g>`;
  s += text(x + 44, 263, 'Search your files…', { size: 11, fill: '#7e8199' });

  // files
  const files = [['hello.enpp', true], ['showcase.enppl', false], ['game.enppl', false],
    ['saved_project.enpp', false], ['draw_sprites.enppl', false], ['python_basics.enppl', false]];
  let fy = 288;
  for (const [name, open] of files) {
    if (open) s += rect(x + 8, fy - 15, SIDEBAR_W - 16, 26, '#ffffff12', 6);
    s += `<g transform="translate(${x + 18},${fy - 11})" fill="none" stroke="${open ? T.accent : '#8b8da4'}" stroke-width="1.5"><svg width="13" height="13" viewBox="0 0 24 24"><path d="M7 3h8l4 4v13H7z"/><path d="M15 3v5h4"/></svg></g>`;
    s += text(x + 38, fy, name, { size: 11, fill: open ? '#efeaff' : '#c3c5d6' });
    fy += 30;
  }
  s += text(x + 14, H - 60, 'Restore missing examples', { size: 10, fill: T.muted });
  s += rect(x + 12, H - 52, SIDEBAR_W - 24, 26, 'transparent', 6, `stroke="#383d51"`);
  s += text(x + SIDEBAR_W / 2, H - 35, 'Restore missing examples', { size: 10, fill: '#c3c5d6', anchor: 'middle' });
  void version;
  return s;
}

// ---------------------------------------------------------------------------
// Editor + console
// ---------------------------------------------------------------------------
const EDITOR_X = RAIL_EDGE + SIDEBAR_W + 1;

function tabStrip() {
  let s = rect(EDITOR_X, 52, W - EDITOR_X, 40, T.bg);
  s += line(EDITOR_X, 92, W, 92, '#ffffff10');
  s += rect(EDITOR_X + 12, 52, 168, 40, T.panel2);
  s += rect(EDITOR_X + 12, 52, 168, 2, T.accent);
  s += text(EDITOR_X + 40, 77, 'E', { size: 10, weight: 700, fill: T.accent });
  s += text(EDITOR_X + 56, 77, 'hello.enpp', { size: 11.5, fill: T.text });
  s += rect(W - 210, 62, 74, 22, 'transparent', 6, `stroke="#3a3d55"`);
  s += text(W - 173, 77, 'Rename', { size: 10.5, fill: '#c9cbdb', anchor: 'middle' });
  s += rect(W - 124, 62, 68, 22, 'transparent', 6, `stroke="#3a3d55"`);
  s += text(W - 90, 77, 'Delete', { size: 10.5, fill: '#c9cbdb', anchor: 'middle' });
  return s;
}

function editorWrite(lines, breadcrumb = 'CODE EDITOR', caretLine = null, highlightLine = null, bottom = 572) {
  const width = W - EDITOR_X;
  let s = rect(EDITOR_X, 92, width, bottom - 92, T.bg);
  s += text(EDITOR_X + 16, 116, breadcrumb, { size: 9, weight: 800, fill: T.faint, spacing: 1.4 });
  let y = 148;
  lines.forEach((source, i) => {
    const n = i + 1;
    if (highlightLine === n) s += rect(EDITOR_X, y - 16, width, 24, '#ffffff08');
    s += text(EDITOR_X + 40, y, String(n), { font: MONO, size: 12, fill: '#4b4d63', anchor: 'end' });
    s += code(EDITOR_X + 60, y, source);
    y += 24;
  });
  if (caretLine) {
    const cy = 148 + (caretLine - 1) * 24;
    s += rect(EDITOR_X + 55, cy - 12, 2, 17, T.accent);
  }
  // status strip
  s += line(EDITOR_X, bottom, W, bottom, '#ffffff10');
  s += text(EDITOR_X + 16, bottom + 18, 'hello.enpp · Line 1, Column 1 · ' + lines.length + ' lines', { size: 10, fill: T.muted });
  s += text(W - 16, bottom + 18, 'Libraries: None · ● Ready', { size: 10, fill: T.muted, anchor: 'end' });
  s += line(EDITOR_X, bottom + 28, W, bottom + 28, '#ffffff10');
  return s;
}

function consolePanel(element, top = 600) {
  const width = W - EDITOR_X;
  let s = rect(EDITOR_X, top, width, H - 26 - top, T.panel);
  s += text(EDITOR_X + 16, top + 24, 'OUTPUT', { size: 9.5, weight: 800, fill: '#c4c6d8', spacing: 1.3 });
  s += rect(EDITOR_X + 16, top + 34, 52, 2, T.accent);
  s += text(W - 150, top + 28, 'Clear output', { size: 10, fill: T.muted });
  s += element(EDITOR_X + 24, top + 54, width);
  return s;
}

const consoleText = (x, y, rows, step = 20) => rows.map(([line, colour], i) =>
  text(x, y + i * step, line, { font: MONO, size: 12.5, fill: colour || '#cfd2e2' })).join('');

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------
function frame(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    rect(0, 0, W, H, T.bg) + body + '</svg>';
}

const HELLO = [
  'note [Your first E++ program in pure .enpp]',
  'say "Hello, World!"',
  'say "Looks like English, feels like english, and is english"',
  '',
  'note [No quotes for math, evaluated naturally:]',
  'say 1 plus 1',
  'say 2 times 3',
  '',
  'note [Quotes are strictly string text:]',
  'say "1 + 1"',
];

const show = (name) => console.log('  wrote assets/' + name);
const files = [];

async function shot(name, svg) {
  files.push(name);
  if (process.env.EPP_DUMP) writeFileSync('/tmp/' + name.replace(/\.jpg$/, '.svg'), svg);
  await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(path.join(OUT, name));
  show(name);
}

// ---------------------------------------------------------------------------
// 1.4b1 — a warning and a fatal error, side by side in the console
// ---------------------------------------------------------------------------
function errorCard(x, y, w, h, codeText, name, where, lineNo, sourceLine, caretCol, reason, help) {
  let s = rect(x, y, w, h, '#2a1c22', 9, `stroke="#5d3038"`);
  s += rect(x, y, 3, h, T.red, 2);
  s += text(x + 16, y + 22, `[E++ Error ${codeText}: ${name}]`, { font: MONO, size: 12, weight: 700, fill: T.red });
  s += text(x + 340, y + 22, `--> hello.enpp:${where}`, { font: MONO, size: 10.5, fill: '#c8a5ac' });
  s += text(x + 16, y + 44, `${lineNo} |   ${sourceLine}`, { font: MONO, size: 11, fill: '#d8b9c0' });
  s += text(x + 16 + (String(lineNo).length + 5 + caretCol) * 6.6, y + 58, '^', { font: MONO, size: 11, fill: T.red });
  s += text(x + 16, y + 78, '* ' + reason, { size: 10.5, fill: '#c9aeb4' });
  s += text(x + 16, y + 96, '* Help: ' + help, { size: 10.5, fill: '#a8919a' });
  return s;
}

function warnCard(x, y, w, codeText, what, detail, fix) {
  let s = rect(x, y, w, 70, '#2a2519', 9, `stroke="#5c4f22"`);
  s += rect(x, y, 3, 70, T.amber, 2);
  s += text(x + 16, y + 22, `⚠  ${codeText} · Warning · ${what}`, { size: 11, weight: 700, fill: T.amber });
  s += text(x + 16, y + 40, detail, { size: 10.5, fill: '#a99b7e' });
  s += text(x + 16, y + 56, fix, { font: MONO, size: 10.5, fill: '#9a8d72' });
  return s;
}

async function betaError(version) {
  const lines = [
    'add the "Math" library',
    'say "1 plus 1"',
    'say 2 plus 2',
    'wait "3" seconds',
    'say "done"',
    '',
    'repeat 3 times',
    '  say "counting"',
  ];
  const element = (x, y, w) => {
    const colW = (w - 72) / 2;
    let s = consoleText(x, y, [['1 plus 1', T.text], ['4', T.text], ['done', T.text]]);
    s += warnCard(x, y + 70, colW, 'W001', 'Text Looks Like An Equation',
      'The quotes make "1 plus 1" plain text.', 'say 1 plus 1   →   2');
    s += warnCard(x + colW + 24, y + 70, colW, 'W005', 'Number Written As Text',
      'wait needs a number, not "3".', 'wait 3 seconds');
    s += errorCard(x, y + 152, w - 24, 112, 'E018', 'Unclosed Block', '7:1', 7,
      'repeat 3 times', 0, 'This repeat block has no matching ending.',
      'Close it with: end repeat');
    return s;
  };
  const svg = frame(topbar(version) + rail(version, 'files') + sidebarActive(version) +
    tabStrip() + editorWrite(lines, 'CODE EDITOR', 7, 7, 528) + consolePanel(element, 556) + statusbar());
  await shot('news-errors-1.4b1.jpg', svg);
}

// ---------------------------------------------------------------------------
// 1.4b1 — the sidebar, grouped and labelled
// ---------------------------------------------------------------------------
async function betaSidebar(version) {
  const element = (x, y) => {
    let s = text(x, y, 'The sidebar now groups its buttons and names every one of them.', { size: 12.5, fill: T.text });
    s += text(x, y + 24, 'Before, five icons sat in a column with no words: a book, a cap and a grid', { size: 11.5, fill: T.muted });
    s += text(x, y + 42, 'could have been anything. Now each group says what its buttons are for.', { size: 11.5, fill: T.muted });

    const cards = [['PANELS', 'Files · Libraries · Reference', 'Open a panel in the sidebar.'],
      ['HELP', 'Learn · Settings', 'Cards to learn from, and how Studio behaves.'],
      ['MORE', 'Customize', 'Move or hide any button, including these.']];
    cards.forEach(([group, buttons, blurb], i) => {
      const cx = x + i * 320;
      s += rect(cx, y + 70, 300, 92, '#1d1f30', 9, `stroke="#333650"`);
      s += text(cx + 14, y + 92, group, { size: 8.5, weight: 800, fill: T.accent, spacing: 1.3 });
      s += text(cx + 14, y + 116, buttons, { size: 11.5, weight: 700 });
      wrap(blurb, 40).forEach((row, j) => { s += text(cx + 14, y + 136 + j * 15, row, { size: 10, fill: T.muted }); });
    });
    s += text(x, y + 196, 'Same buttons, same shortcuts — you no longer have to guess what any of them does.', { size: 11, fill: '#b9b2d8' });
    return s;
  };
  const svg = frame(topbar(version) + rail(version, 'files') + sidebarActive(version) +
    tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1, null, 542) + consolePanel(element, 570) + statusbar());
  await shot('news-sidebar-1.4b1.jpg', svg);
}

// ---------------------------------------------------------------------------
// 1.4b1 — the catalogue itself: 75 / 5 / 5 / 15, Reference open
// ---------------------------------------------------------------------------
function guidePanel(x, y, w) {
  let s = text(x, y, 'E++ QUICK REFERENCE', { size: 8.5, weight: 800, fill: T.faint, spacing: 1.4 });
  s += text(x, y + 28, 'The three golden rules', { size: 12.5, weight: 700 });
  [['01', 'Math has no quotes'], ['02', "Variables use 'single' quotes"], ['03', 'Text uses "double" quotes']]
    .forEach(([n, rule], i) => {
      s += text(x, y + 50 + i * 22, n, { font: MONO, size: 10, fill: T.accent });
      s += text(x + 26, y + 50 + i * 22, rule, { size: 10.5, fill: '#c9cbdb' });
    });
  s += line(x, y + 108, x + w, y + 108, '#2d3046');
  s += text(x, y + 128, 'Errors', { size: 11, weight: 700 });
  [['E', '75', 'general'], ['W', '5', 'warnings'], ['Z', '5', 'E++.zip'], ['F', '15', 'fatal lexer']]
    .forEach(([letter, count, label], i) => {
      s += text(x, y + 150 + i * 20, letter, { font: MONO, size: 10.5, weight: 700, fill: T.accent });
      s += text(x + 22, y + 150 + i * 20, count, { font: MONO, size: 10.5, fill: T.text });
      s += text(x + 46, y + 150 + i * 20, label, { size: 10.5, fill: T.muted });
    });
  return s;
}

async function betaCatalogue(version) {
  const element = (x, y, w) => {
    let s = text(x, y, 'One hundred codes, each with a name, a reason and a fix.', { size: 12.5, fill: T.text });
    s += text(x, y + 24, 'LANGUAGE.md §14 lists all of them; every engine prints the same words.', { size: 11.5, fill: T.muted });

    const cards = [
      ['E', '75', 'General errors', 'The program stops at the mistake.', T.red],
      ['W', '5', 'Warnings', 'Odd but legal: it keeps running.', T.amber],
      ['Z', '5', 'E++.zip only', 'Studio-only libraries, named.', T.blue],
      ['F', '15', 'Fatal lexer', 'The source cannot be read.', T.accent],
    ];
    const cw = (w - 96) / 4;
    cards.forEach(([letter, count, title, blurb, colour], i) => {
      const cx = x + i * (cw + 20);
      s += rect(cx, y + 48, cw, 96, '#1d1f30', 9, `stroke="#333650"`);
      s += rect(cx, y + 48, cw, 3, colour, 2);
      s += text(cx + 14, y + 88, letter, { size: 15, weight: 800, fill: colour, font: MONO });
      s += text(cx + 34, y + 89, count, { size: 20, weight: 800, fill: T.text });
      s += text(cx + 14, y + 110, title, { size: 10.5, weight: 700 });
      wrap(blurb, 26).forEach((row, j) => { s += text(cx + 14, y + 126 + j * 13, row, { size: 9.5, fill: T.muted }); });
    });
    s += text(x, y + 176, '[E++ Error E018: Unclosed Block]  -->  game.enppl:7:1', { font: MONO, size: 11, fill: '#c8a5ac' });
    s += text(x, y + 196, '= Reason: This repeat block has no matching ending.', { font: MONO, size: 10.5, fill: '#a8919a' });
    return s;
  };
  let body = topbar(version) + rail(version, 'guide');
  body += sidebarActive(version, 'Reference', guidePanel);
  body += tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1, null, 542) + consolePanel(element, 570);
  await shot('news-catalogue-1.4b1.jpg', frame(body + statusbar()));
}

// ---------------------------------------------------------------------------
// 1.4b1 — warnings stream in while the program keeps running
// ---------------------------------------------------------------------------
async function betaWarning(version) {
  const lines = [
    'add the "ImprovedWait" library',
    'say "1 plus 1"',
    'wait "2" seconds',
    'say 2 plus 2',
  ];
  const element = (x, y, w) => {
    let s = consoleText(x, y, [['1 plus 1', T.text], ['4', T.text]]);
    s += rect(x, y + 46, w - 24, 34, '#22243a', 8, `stroke="#3a3d57"`);
    s += `<circle cx="${x + 12}" cy="${y + 63}" r="3" fill="${T.green}"/>`;
    s += text(x + 26, y + 67, 'Finished in 2.01 s · 2 warnings · the program ran to the end', { size: 10.5, fill: '#c9cbdb' });
    s += warnCard(x, y + 92, w - 24, 'W001', 'Text Looks Like An Equation',
      'The quotes turn the maths into plain text. The program runs on.', 'say 1 plus 1   →   2');
    s += warnCard(x, y + 176, w - 24, 'W005', 'Number Written As Text',
      'wait needs a number, not a string. It still waits 2 seconds.', 'wait 2 seconds');
    s += text(x, y + 268, 'Warnings never stop a program. Studio lists them before you run,', { size: 10.5, fill: T.muted });
    s += text(x, y + 286, 'and EPP.run(source, { onWarning }) streams them live.', { size: 10.5, fill: T.muted });
    return s;
  };
  const svg = frame(topbar(version) + rail(version, 'files') + sidebarActive(version) +
    tabStrip() + editorWrite(lines, 'CODE EDITOR', 4, 2, 542) + consolePanel(element, 570) + statusbar());
  await shot('news-warnings-1.4b1.jpg', svg);
}

// ---------------------------------------------------------------------------
// 1.4a3 — motion, settings and Tools (the real a3 features)
// ---------------------------------------------------------------------------
async function alpha3Studio(version) {
  const element = (x, y) => consoleText(x, y, [
    ['Hello, World!', T.text],
    ['Looks like English, feels like english, and is english', T.text],
    ['2', T.text],
    ['6', T.text],
    ['1 + 1', T.text],
  ]);
  const svg = frame(topbar(version) + rail(version, 'files') + sidebarActive(version) +
    tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1) + consolePanel(element) + statusbar());
  await shot('news-studio-1.4a3.jpg', svg);
}

async function alpha3Settings(version) {
  // Settings dialog over a dimmed Studio.
  let s = topbar(version) + rail(version, 'settings') + sidebarActive(version) + tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1);
  s += rect(0, 0, W, H, '#07070d', 0, 'opacity="0.62"');
  const dw = 620;
  const dx = (W - dw) / 2;
  const dy = 120;
  s += rect(dx, dy, dw, 560, '#191b2b', 14, `stroke="#3a3d57"`);
  s += text(dx + 24, dy + 40, 'Settings', { size: 17, weight: 700 });
  s += text(dx + dw - 24, dy + 40, '✕', { size: 15, fill: T.muted, anchor: 'end' });
  s += line(dx, dy + 60, dx + dw, dy + 60, '#2d3046');

  s += text(dx + 24, dy + 88, 'APPEARANCE', { size: 9, weight: 800, fill: T.accent, spacing: 1.4 });
  s += text(dx + 24, dy + 112, 'Theme', { size: 12, weight: 700 });
  const swatches = ['#b7a4ff', '#80d9c1', '#f2c46b', '#ff8998', '#8fb8ff', '#c9ccd8'];
  swatches.forEach((c, i) => {
    const cx = dx + 24 + i * 44;
    s += rect(cx, dy + 124, 32, 32, c, 8, i === 0 ? `stroke="#ffffff" stroke-width="2"` : '');
    if (i === 0) s += text(cx + 16, dy + 146, '✓', { size: 13, weight: 700, fill: '#1a1730', anchor: 'middle' });
  });
  s += text(dx + 24, dy + 184, 'Editor text size', { size: 12, weight: 700 });
  s += rect(dx + 220, dy + 172, 220, 4, '#33364d', 2);
  s += rect(dx + 220, dy + 172, 120, 4, T.accent, 2);
  s += `<circle cx="${dx + 340}" cy="${dy + 174}" r="7" fill="${T.accent}"/>`;
  s += text(dx + 460, dy + 178, '14 px', { size: 11, fill: T.muted });

  s += line(dx + 24, dy + 204, dx + dw - 24, dy + 204, '#2d3046');
  s += text(dx + 24, dy + 232, 'MOTION', { size: 9, weight: 800, fill: T.accent, spacing: 1.4 });
  s += text(dx + 24, dy + 258, 'Studio animations', { size: 12, weight: 700 });
  s += text(dx + 24, dy + 276, 'Menus, panels and dialogs move gently. Turn this off for a still Studio.', { size: 10.5, fill: T.muted });
  s += rect(dx + dw - 76, dy + 244, 44, 24, T.accent, 12);
  s += `<circle cx="${dx + dw - 74}" cy="${dy + 256}" r="10" fill="#ffffff"/>`;
  s += text(dx + 24, dy + 304, 'Respect reduced motion', { size: 12, weight: 700 });
  s += text(dx + 24, dy + 322, 'Your system preference always wins.', { size: 10.5, fill: T.muted });
  s += rect(dx + dw - 76, dy + 290, 44, 24, '#3a3d57', 12);
  s += `<circle cx="${dx + dw - 54}" cy="${dy + 302}" r="10" fill="#8f92a8"/>`;

  s += line(dx + 24, dy + 348, dx + dw - 24, dy + 348, '#2d3046');
  s += text(dx + 24, dy + 376, 'WORKSPACE', { size: 9, weight: 800, fill: T.accent, spacing: 1.4 });
  s += text(dx + 24, dy + 402, 'Reset appearance', { size: 12, weight: 700 });
  s += text(dx + 24, dy + 420, 'Restore the default colors and editor options. Your files stay put.', { size: 10.5, fill: T.muted });
  s += rect(dx + dw - 168, dy + 388, 144, 28, 'transparent', 8, `stroke="#4a4d68"`);
  s += text(dx + dw - 96, dy + 407, 'Reset appearance', { size: 10.5, fill: '#d3d5e4', anchor: 'middle' });

  s += line(dx, dy + 460, dx + dw, dy + 460, '#2d3046');
  s += rect(dx + dw - 108, dy + 484, 84, 30, T.accent, 8);
  s += text(dx + dw - 66, dy + 504, 'Done', { size: 11.5, weight: 700, fill: '#1a1730', anchor: 'middle' });

  await shot('news-settings-1.4a3.jpg', frame(s));
}

async function alpha3Tools(version) {
  let s = topbar(version) + rail(version, 'files') + sidebarActive(version) + tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1);
  s += rect(0, 0, W, H, '#07070d', 0, 'opacity="0.55"');
  const pw = 560;
  const px = W - pw - 40;
  const py = 66;
  s += rect(px, py, pw, 560, '#191b2b', 12, `stroke="#3a3d57"`);
  s += text(px + 20, py + 32, 'Tools', { size: 16, weight: 700 });
  s += text(px + pw - 22, py + 32, '✕', { size: 14, fill: T.muted, anchor: 'end' });
  s += rect(px + 16, py + 48, pw - 32, 30, '#22243a', 8, `stroke="#383d51"`);
  s += text(px + 30, py + 68, 'Search features and projects…', { size: 11, fill: '#7e8199' });
  s += text(px + 20, py + 104, 'FEATURES', { size: 8.5, weight: 800, fill: T.faint, spacing: 1.4 });
  const feats = [['▸', 'Run code', 'Ctrl+Enter'], ['▥', 'Libraries', 'Add a library'],
    ['▧', 'Reference', 'Golden rules'], ['⇧', 'EShare', 'Share a program'],
    ['⌑', 'Project keys', 'Sealed projects'], ['⇩', 'Download E++.zip', 'Offline build']];
  feats.forEach(([icon, name, hint], i) => {
    const fy = py + 122 + i * 40;
    if (i === 0) s += rect(px + 12, fy - 20, pw - 24, 34, '#ffffff10', 7);
    s += text(px + 28, fy, icon, { size: 12, fill: T.accent });
    s += text(px + 52, fy, name, { size: 11.5, weight: 600 });
    s += text(px + pw - 28, fy, hint, { size: 10, fill: T.muted, anchor: 'end' });
  });
  s += line(px + 20, py + 382, px + pw - 20, py + 382, '#2d3046');
  s += text(px + 20, py + 410, 'PROJECTS', { size: 8.5, weight: 800, fill: T.faint, spacing: 1.4 });
  [['hello.enpp', 'pure program'], ['showcase.enppl', 'libraries'], ['game.enppl', 'Game library']]
    .forEach(([name, kind], i) => {
      const fy = py + 432 + i * 36;
      s += text(px + 28, fy, '▤', { size: 11, fill: '#8b8da4' });
      s += text(px + 52, fy, name, { size: 11.5, fill: '#d5d7e5' });
      s += text(px + pw - 28, fy, kind, { size: 10, fill: T.muted, anchor: 'end' });
    });
  s += text(px + 20, py + 546, 'Ctrl+Shift+P opens Tools anywhere', { size: 10, fill: T.faint });

  await shot('news-tools-1.4a3.jpg', frame(s));
}

// ---------------------------------------------------------------------------
// 1.4a2 — launcher layout: dragging shortcuts and presets
// ---------------------------------------------------------------------------
async function alpha2Layout(version) {
  let s = topbar(version) + rail(version, 'customize') + sidebarActive(version) + tabStrip() + editorWrite(HELLO, 'CODE EDITOR', 1);
  s += rect(0, 0, W, H, '#07070d', 0, 'opacity="0.55"');
  const dw = 700;
  const dx = (W - dw) / 2;
  const dy = 96;
  s += rect(dx, dy, dw, 600, '#191b2b', 14, `stroke="#3a3d57"`);
  s += text(dx + 24, dy + 38, 'Edit Studio', { size: 17, weight: 700 });
  s += text(dx + 24, dy + 58, 'Arrange, remove, and restore launcher shortcuts.', { size: 11, fill: T.muted });
  s += text(dx + dw - 24, dy + 38, '✕', { size: 15, fill: T.muted, anchor: 'end' });
  s += line(dx, dy + 76, dx + dw, dy + 76, '#2d3046');

  s += text(dx + 24, dy + 102, 'PRESETS', { size: 8.5, weight: 800, fill: T.faint, spacing: 1.4 });
  [['Everything', true], ['Focused', false], ['Top bar', false]].forEach(([label, on], i) => {
    const bx = dx + 24 + i * 118;
    s += rect(bx, dy + 114, 108, 30, on ? T.accent : 'transparent', 8, on ? '' : `stroke="#4a4d68"`);
    s += text(bx + 54, dy + 133, label, { size: 10.5, weight: 700, fill: on ? '#1a1730' : '#c9cbdb', anchor: 'middle' });
  });

  s += text(dx + 24, dy + 178, 'SIDEBAR', { size: 8.5, weight: 800, fill: T.faint, spacing: 1.4 });
  const items = [['▤', 'Files', 'Activity bar'], ['▥', 'Libraries', 'Activity bar'],
    ['▧', 'Reference', 'Activity bar'], ['✦', 'Learn', 'Activity bar'],
    ['⚙', 'Settings', 'Activity bar'], ['⇧', 'EShare', 'Activity bar']];
  items.forEach(([icon, name, where], i) => {
    const fy = dy + 200 + i * 44;
    s += rect(dx + 16, fy - 20, dw - 32, 38, i === 5 ? '#ffffff0d' : 'transparent', 7,
      i === 5 ? `stroke="#5a4f8a" stroke-dasharray="4 3"` : '');
    s += text(dx + 34, fy + 3, '⠿', { size: 12, fill: '#6f7288' });
    s += text(dx + 58, fy + 3, icon, { size: 12, fill: T.accent });
    s += text(dx + 82, fy + 3, name, { size: 11.5, weight: 600 });
    s += rect(dx + dw - 158, fy - 12, 128, 26, '#22243a', 6, `stroke="#383d51"`);
    s += text(dx + dw - 94, fy + 5, where, { size: 10, fill: '#c9cbdb', anchor: 'middle' });
    s += text(dx + dw - 44, fy + 4, '⇅', { size: 12, fill: '#8b8da4' });
  });
  s += rect(dx + 24, dy + 490, dw - 48, 60, '#1f2133', 9, `stroke="#3a3d57" stroke-dasharray="5 4"`);
  s += text(dx + dw / 2, dy + 526, 'Drop a shortcut here to move it to the top bar', { size: 11, fill: '#8f92a8', anchor: 'middle' });

  s += line(dx, dy + 566, dx + dw, dy + 566, '#2d3046');
  s += text(dx + 24, dy + 588, 'Tip: drag any shortcut, or pick a destination from its menu.', { size: 10, fill: T.muted });
  s += rect(dx + dw - 108, dy + 574, 84, 28, T.accent, 8);
  s += text(dx + dw - 66, dy + 593, 'Done', { size: 11, weight: 700, fill: '#1a1730', anchor: 'middle' });

  await shot('news-layout-1.4a2.jpg', frame(s));
}

// ---------------------------------------------------------------------------
const V_A2 = '1.4a2';
const V_A3 = '1.4a3';
const V_B1 = '1.4b1';
await alpha2Layout(V_A2);
await alpha3Studio(V_A3);
await alpha3Settings(V_A3);
await alpha3Tools(V_A3);
await betaError(V_B1);
await betaSidebar(V_B1);
await betaCatalogue(V_B1);
await betaWarning(V_B1);

console.log('done:', files.length, 'screenshots');
