#!/usr/bin/env node
/*
 * Builds the release bundle: E++.zip (and its twin epp_language.zip, which the
 * Studio reads for the offline runtime check).
 *
 * E++.zip is the *standalone* build of E++ 1.2. Two of the new libraries need
 * things the standalone bundle cannot carry:
 *
 *   Game         — needs a canvas and js/game-library.js
 *   ImprovedWait — the actor half of the waiting engine (the biggest module)
 *
 * Both stay out of this bundle. Nothing is silently missing: the copy of
 * index.html inside the zip is stamped with `window.EPP_DISTRIBUTION = true`,
 * so `add library "Game"` explains that the library lives in the full Studio
 * download, and the library cards for both are removed from the page.
 *
 * The other two 1.2 libraries ARE here:
 *
 *   Keyboard         — js/keyboard.js
 *   ImprovedWaitLite — every non-game waiting feature
 *
 * Usage: node tools/build-zip.mjs   (or: make zip)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = path.join(ROOT, '.dist', 'E++');
const ZIP = path.join(ROOT, 'E++.zip');
const ZIP_TWIN = path.join(ROOT, 'epp_language.zip');

// Files and folders that travel in the bundle. `epp` is the compiled native
// engine; everything else is source.
const ENTRIES = [
  'include',
  'src',
  'js',
  'css',
  'examples',
  'Makefile',
  'CMakeLists.txt',
  'README.md',
  'LANGUAGE.md',
  'index.html',
  'lexer.py',
  'epp.py',
  'epp'
];

// A distribution never ships the Game runtime, so it never ships the file that
// implements it. The Studio builds its game pane with it.
const DISTRIBUTION_EXCLUDED = [
  'js/game-library.js'
];

// Libraries that are not in this build. Any example that needs one is left out
// too, rather than shipped broken.
const MISSING_LIBRARIES = ['Game', 'ImprovedWait'];

function log(message) {
  process.stdout.write('  ' + message + '\n');
}

function copyIntoStage() {
  fs.rmSync(path.dirname(STAGE), { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  for (const entry of ENTRIES) {
    const from = path.join(ROOT, entry);
    if (!fs.existsSync(from)) {
      throw new Error('Missing bundle entry: ' + entry + ' (run `make` first for the native engine).');
    }
    const to = path.join(STAGE, entry);
    fs.cpSync(from, to, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(ROOT, source).split(path.sep).join('/');
        if (!relative) return true;
        if (DISTRIBUTION_EXCLUDED.includes(relative)) return false;
        if (relative.endsWith('.o')) return false;
        if (relative.includes('__pycache__')) return false;
        if (relative.endsWith('.DS_Store')) return false;
        return true;
      }
    });
    log('copied ' + entry);
  }
}

function mentionsMissingLibrary(text) {
  return MISSING_LIBRARIES.some((name) => {
    const pattern = new RegExp('add\\s+(?:the\\s+)?["\']?' + name + '["\']?\\s+library', 'i');
    return pattern.test(text);
  });
}

function dropExamplesThatNeedMissingLibraries() {
  const examplesDir = path.join(STAGE, 'examples');
  if (!fs.existsSync(examplesDir)) return;
  for (const name of fs.readdirSync(examplesDir)) {
    const file = path.join(examplesDir, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (mentionsMissingLibrary(text)) {
      fs.rmSync(file);
      log('left out examples/' + name + ' (needs a library this build does not have)');
    }
  }
}

function stampDistributionFlag() {
  const page = path.join(STAGE, 'index.html');
  let html = fs.readFileSync(page, 'utf8');

  const anchor = '<script src="js/libraries.js"></script>';
  if (!html.includes(anchor)) {
    throw new Error('index.html no longer loads js/libraries.js; update tools/build-zip.mjs');
  }
  // The flag has to exist before any library is added, so it goes in front of
  // the module that owns the registry.
  html = html.replace(
    anchor,
    '<script>\n// This copy of the Studio ships in E++.zip. Game and ImprovedWait are only\n' +
    '// in the full Studio download; Keyboard and ImprovedWaitLite are here.\n' +
    'window.EPP_DISTRIBUTION = true;\n</script>\n' + anchor
  );

  // The game runtime is not part of the bundle, so neither is its <script>.
  html = html.split('\n').filter((line) => !line.includes('src="js/game-library.js"')).join('\n');

  if (!html.includes('window.EPP_DISTRIBUTION = true')) {
    throw new Error('Failed to stamp the distribution flag into index.html');
  }
  fs.writeFileSync(page, html);
  log('stamped index.html as a E++.zip build');
}

function buildArchive() {
  fs.rmSync(ZIP, { force: true });
  fs.rmSync(ZIP_TWIN, { force: true });
  fs.rmSync(path.join(STAGE, 'epp_language.zip'), { force: true });

  // First the offline runtime the Studio checks for, then the release bundle
  // with that runtime tucked inside, so an extracted E++.zip runs offline
  // straight away instead of asking for a second download.
  execFileSync('zip', ['-r', '-X', '-q', ZIP_TWIN, '.'], { cwd: STAGE });
  log('wrote ' + path.basename(ZIP_TWIN));
  fs.copyFileSync(ZIP_TWIN, path.join(STAGE, 'epp_language.zip'));
  execFileSync('zip', ['-r', '-X', '-q', ZIP, '.'], { cwd: STAGE });
  log('wrote ' + path.basename(ZIP));
}

function verifyArchive() {
  const listing = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const mustHave = [
    'index.html',
    'epp_language.zip',
    'css/ide.css',
    'lexer.py',
    'epp.py',
    'include/vault.hpp',
    'src/vault.cpp',
    'js/libraries.js',
    'js/vault.js',
    'js/keyboard.js'
  ];
  const mustNotHave = ['js/game-library.js'];

  for (const entry of mustHave) {
    if (!listing.includes(entry)) throw new Error('E++.zip is missing ' + entry);
  }
  for (const entry of mustNotHave) {
    if (listing.includes(entry)) throw new Error('E++.zip must not contain ' + entry);
  }

  const page = fs.readFileSync(path.join(STAGE, 'index.html'), 'utf8');
  if (!page.includes('window.EPP_DISTRIBUTION = true')) {
    throw new Error('E++.zip index.html does not mark itself as a distribution build');
  }

  // Keyboard and ImprovedWaitLite have to be usable inside the bundle, and the
  // two missing libraries must still be described so the page can explain.
  const registry = fs.readFileSync(path.join(STAGE, 'js', 'libraries.js'), 'utf8');
  for (const name of ['Keyboard', 'ImprovedWaitLite', 'Game', 'ImprovedWait']) {
    if (!registry.includes('    ' + name + ': {')) {
      throw new Error('js/libraries.js no longer describes the ' + name + ' library');
    }
  }
  if (!page.includes("hideForDistribution(['Game', 'ImprovedWait'])")) {
    throw new Error('index.html no longer switches off Game/ImprovedWait for a distribution build');
  }

  log('verified ' + listing.length + ' files: Keyboard + ImprovedWaitLite in, Game + ImprovedWait out');
}

copyIntoStage();
dropExamplesThatNeedMissingLibraries();
stampDistributionFlag();
buildArchive();
verifyArchive();
console.log('\nE++.zip is ready.');
