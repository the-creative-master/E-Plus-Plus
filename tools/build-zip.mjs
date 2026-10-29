#!/usr/bin/env node
/*
 * Builds E++.zip and epp_language.zip. Studio executes its embedded compiled
 * C++ lexer directly; these archives are downloadable distributions.
 *
 * E++.zip is the *standalone* build of E++ 1.3.5. The Studio and the zip carry
 * different halves of the game tooling, and only one of them at a time:
 *
 *   Studio (E++ Studio)          Draw, Game, ImprovedWait
 *   Zip    (the standalone)      Keyboard, ImprovedWaitLite
 *
 * Colors is Studio-only in this release. Draw and Game need canvas hosts; ImprovedWait is the actor half of
 * the waiting engine. None of these runtimes travels in this bundle. Nothing is
 * silently missing: the copy of index.html inside the zip is stamped with
 * `window.EPP_DISTRIBUTION = true`, which makes js/libraries.js hide
 * Colors/Draw/Game/ImprovedWait and keeps Keyboard/ImprovedWaitLite, so `add library "Game"`
 * explains that the library lives in the full Studio download and the library
 * cards for both are removed from the page.
 *
 * ImprovedWaitLite is the reverse case: it is *only* here. The Studio hides it
 * and offers ImprovedWait instead, so no page ever shows two ways to wait.
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
  'LICENSE',
  'third_party/licenses',
  'README.md',
  'LANGUAGE.md',
  'WIKI.md',
  'wiki.html',
  'server.js',
  'index.html',
  'lexer.py',
  'epp.py',
  'tests/cli-1.3.py',
  'tests/native-lexer.mjs',
  'tools/build-lexer-wasm.mjs',
  'tools/build-wiki.py',
  'epp'
];

// A distribution never ships the Game runtime, so it never ships the file that
// implements it. The Studio builds its game pane with it.
const DISTRIBUTION_EXCLUDED = [
  'js/game-library.js',
  'js/draw-library.js'
];

// Libraries that are not in this build. Any example that needs one is left out
// too, rather than shipped broken.
const MISSING_LIBRARIES = ['Game', 'ImprovedWait', 'Draw', 'Colors'];

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
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(ROOT, source).split(path.sep).join('/');
        if (!relative) return true;
        if (DISTRIBUTION_EXCLUDED.includes(relative)) return false;
        if (relative.endsWith('.o') || relative.endsWith('.d')) return false;
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
    const aliases = name === 'Draw' ? '(?:Draw|Drawing|Sprites)' : name === 'Colors' ? '(?:Colors|Colours|Color|Colour)' : name;
    const libraryLast = new RegExp(`add\\s+(?:the\\s+)?["']?${aliases}["']?\\s+library\\b`, 'i');
    const libraryFirst = new RegExp(`add\\s+(?:the\\s+)?librar(?:y|ies)\\s+["']?${aliases}["']?(?:\\s|$)`, 'i');
    return libraryLast.test(text) || libraryFirst.test(text) || (name === 'Draw' && /\bdrawing\s+sprite\b/i.test(text));
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

// The legacy JavaScript core can also be loaded directly, outside index.html.
// Make the distribution split its default and remove the sprite execution
// implementation there as well, retaining only informative error stubs.
function stripDrawFromStandaloneCore() {
  const js = path.join(STAGE, 'js');
  function replaceSection(source, start, end, replacement) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first + start.length);
    if (first < 0 || last < 0) throw new Error('Could not strip standalone Draw section: ' + start);
    return source.slice(0, first) + replacement + source.slice(last);
  }
  const registryFile = path.join(js, 'libraries.js');
  let registry = fs.readFileSync(registryFile, 'utf8');
  registry = replaceSection(registry, '    Colors: {', '    Console: {', `    Colors: {
      name: 'Colors', aliases: ['colors', 'colours', 'color', 'colour'],
      description: 'Colors is available in the full E++ Studio, not E++.zip.',
      unlocks: [], example: ''
    },
`);
  registry = replaceSection(registry, '    Draw: {', '    Image: {', `    Draw: {
      name: 'Draw', aliases: ['draw', 'drawing', 'sprites'],
      description: 'Draw is available in the full E++ Studio, not E++.zip.',
      unlocks: [], example: ''
    },
`);
  const registryAnchor = '  EPP.Libraries = Libraries;';
  if (!registry.includes(registryAnchor)) throw new Error('Could not initialize the standalone library registry');
  registry = registry.replace(registryAnchor, "  Libraries.applyBuild('distribution');\n" + registryAnchor);
  fs.writeFileSync(registryFile, registry);

  const parserFile = path.join(js, 'parser.js');
  let parser = fs.readFileSync(parserFile, 'utf8');
  parser = replaceSection(parser, '      // Check for "drawing sprite" (Draw library)', '      // Check for "image <source>" (Image library)',
    `      // Draw is not shipped in the standalone runtime.
      if (this.isWord('drawing')) throw new LibraryError('The Draw library is only available in E++ Studio.', kw.line, kw.column);
`);
  const moveAnchor = "    if (t.type === 'VARIABLE') return this.parseMoveSprite();";
  if (!parser.includes(moveAnchor)) throw new Error('Could not disable sprite movement in the standalone parser');
  parser = parser.replace(moveAnchor, "    if (t.type === 'VARIABLE') throw new LibraryError('Sprite movement is only available in E++ Studio.', t.line, t.column);");
  parser = replaceSection(parser, "  /** 'name' move up/down/left/right", '  Parser.prototype.parseSet = function () {', '');
  fs.writeFileSync(parserFile, parser);

  const interpreterFile = path.join(js, 'interpreter.js');
  let interpreter = fs.readFileSync(interpreterFile, 'utf8');
  interpreter = replaceSection(interpreter, '    // Draw library hook:', '    // Dev Build 5: Image library hooks.', '');
  interpreter = replaceSection(interpreter, '      case AST.DEFINE_SPRITE: {', '      case AST.DEFINE_IMAGE: {',
    `      case AST.DEFINE_SPRITE:
      case AST.MOVE_SPRITE:
        throw new LibraryError('Drawing sprites are only available in E++ Studio.', node.line, node.column);
`);
  fs.writeFileSync(interpreterFile, interpreter);
  log('removed Draw execution from the standalone JavaScript core');
}

// The full repository keeps Colors. The standalone native and Python sources
// are patched as well as the binary, so rebuilding an extracted archive cannot
// accidentally bring the excluded library back.
function stripColorsFromDistribution() {
  function replaceOnce(text, before, after, label) {
    if (!text.includes(before)) throw new Error('Cannot configure Colors exclusion: ' + label);
    return text.replace(before, after);
  }
  function replaceBetween(text, start, end, replacement, label) {
    const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
    if (first < 0 || last < 0) throw new Error('Cannot configure Colors exclusion: ' + label);
    return text.slice(0, first) + replacement + text.slice(last);
  }
  const cppFile = path.join(STAGE, 'src/interpreter.cpp');
  let cpp = fs.readFileSync(cppFile, 'utf8');
  cpp = replaceOnce(cpp,
    'norm == "draw" || norm == "drawing"',
    'norm == "colors" || norm == "colours" || norm == "color" || norm == "colour" || norm == "draw" || norm == "drawing"', 'native library guard');
  cpp = replaceOnce(cpp,
    'require_library("Colors", "Colored output", stmt->line, stmt->col);',
    'throw LibraryError("The Colors library is available in E++ Studio, not in E++.zip.", stmt->line, stmt->col, "E302");', 'native colored say guard');
  cpp = replaceBetween(cpp,
    '    if (!stmt->color.empty()) {\n        std::string ansi',
    '\n}\n\nvoid Interpreter::visitLetStmt',
    '    out << result << "\\n";\n', 'native color output');
  fs.writeFileSync(cppFile, cpp);

  const pyFile = path.join(STAGE, 'epp.py');
  let python = fs.readFileSync(pyFile, 'utf8');
  python = replaceOnce(python,
    'if normalized in ("draw", "drawing", "sprites", "game", "improvedwait"):',
    'if normalized in ("colors", "colours", "color", "colour", "draw", "drawing", "sprites", "game", "improvedwait"):', 'Python library guard');
  python = replaceBetween(python, '        # Check Colors library keyword', '        # Check for separation method',
`        # Colors is not included in this distribution.
        if tokens[0].type == TokenType.IDENTIFIER and tokens[0].lexeme.lower() in {"red", "green", "blue", "yellow", "cyan", "magenta"}:
            raise self.diagnostic("E302", "Library Not In This Build", "The Colors library is available in E++ Studio, not E++.zip.",
                                  "Use a plain say statement in this build.", line_num, col_num)

`, 'Python colored say guard');
  python = replaceOnce(python,
    '        if color_code:\n            print(f"{color_code}{out_str}\\033[0m")\n        else:\n            print(out_str)',
    '        print(out_str)', 'Python color output');
  fs.writeFileSync(pyFile, python);

  // Rebuild *from the staged sources*, not from the full-Studio binary. Leave
  // the rebuilt executable but not intermediate objects in the archive.
  execFileSync('make', ['-B', 'epp'], { cwd: STAGE, stdio: 'pipe' });
  for (const name of fs.readdirSync(path.join(STAGE, 'src'))) {
    if (/\.(?:o|d)$/.test(name)) fs.rmSync(path.join(STAGE, 'src', name));
  }
  const packageJson = { name: 'e-plus-plus-distribution', version: '1.3.5', private: true,
    scripts: { start: 'node server.js' }, engines: { node: '>=18' } };
  fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  const makefile = path.join(STAGE, 'Makefile');
  const make = fs.readFileSync(makefile, 'utf8');
  const originalZip = 'zip: $(TARGET)\n\t@node tools/build-zip.mjs';
  if (!make.includes(originalZip)) throw new Error('Could not configure the standalone make zip target');
  fs.writeFileSync(makefile, make.replace(originalZip, "zip:\n\t@echo 'Rebuild release archives from the full E++ source checkout.'\n\t@exit 1"));
  log('removed Colors from Python and native execution, and rebuilt the standalone binary');
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
    '<script>\n// This copy ships in E++.zip: Draw, Game and ImprovedWait stay in the full\n' +
    '// Studio download, Keyboard and ImprovedWaitLite are here.\n' +
    'window.EPP_DISTRIBUTION = true;\n</script>\n' + anchor
  );

  // The game and drawing hosts are not part of the bundle.
  html = html.split('\n').filter((line) => !line.includes('src="js/game-library.js"') && !line.includes('src="js/draw-library.js"')).join('\n');

  // Do not leave a hidden drawing demo, canvas, controls, or drawing execution
  // handlers in the standalone page. Keep a small E302 guard so programs that
  // ask for a drawing sprite get a useful explanation rather than failing.
  function stripBetween(start, end, replacement = '') {
    const first = html.indexOf(start);
    const last = html.indexOf(end, first + start.length);
    if (first < 0 || last < 0) throw new Error('Could not strip Studio-only Draw section: ' + start);
    html = html.slice(0, first) + replacement + html.slice(last);
  }
  stripBetween('      <div class="library-card" data-library="Colors">', '      <div class="library-card" data-library="System">');
  // The default showcase remains useful without a library the zip omits.
  html = html.replace(/^add\s+the\s+"Colors"\s+library\s*\n/gim, '')
    .replace(/^(\s*)say\s+(?:red|green|blue|yellow|cyan|magenta)\s+/gim, '$1say ')
    .replace("name: 'time_and_colors.enppl'", "name: 'time_demo.enppl'")
    .replace('Time & Colors Demonstration', 'Time Demonstration')
    .replace('Terminal colors and timers work smoothly.', 'Timers work smoothly.');
  stripBetween('      const colorMatch = content.match(', '      let separator = null;', String.raw`      if (/^(red|green|blue|yellow|cyan|magenta)\b\s*/i.test(content)) {
        throw this.diagnostic('E302', 'Library Not In This Build',
          'The Colors library is available in E++ Studio, not inside E++.zip.',
          'Use a plain say statement in this build.', lineNum);
      }

`);
  stripBetween("  {\n    name: 'draw_playground.enppl',", "  {\n    name: 'game_showcase.enppl',");
  stripBetween('        <div id="drawPane"', '        <!-- Game pane:');
  stripBetween('    // Draw sprites are ordinary named variables with an independent cursor.',
    '    // ---------------- Release 1.2 — Game library ----------------',
    String.raw`    // Draw is Studio-only; keep an explicit diagnostic in this build.
    if (/^(?:define|let|set)\s+'[^']+'\s+(?:as|be|to)\s+drawing\s+sprite$/i.test(line)) {
      this.requireDraw(lineNum);
    }

`);
  stripBetween('    if (mGame) {\n      this.drawingSprite(mGame[1], lineNum);',
    '    // 3. DEFINE / LET / SET',
    String.raw`    if (mGame || /^'[^']+'\s+move\b/i.test(line)) this.requireDraw(lineNum);

`);
  stripBetween("document.getElementById('btnClearDrawing').addEventListener", '// ------------------------------------------------------------------\n// Release 1.2 wiring:');
  if (html.includes('id="drawCanvas"') || html.includes("name: 'draw_playground.enppl'") || html.includes('this.drawHost.move(')) {
    throw new Error('The standalone page still contains Draw execution or controls.');
  }

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

  // Build the smaller runtime archive, then include it in the release bundle
  // so the extracted distribution also offers the runtime download offline.
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
    'LICENSE',
    'third_party/licenses/llvm-libcxx.txt',
    'third_party/licenses/wasi-libc-notice.txt',
    'epp_language.zip',
    'css/ide.css',
    'css/studio.css',
    'js/diagnostics.js',
    'js/studio-editor.js',
    'js/native-lexer.js',
    'js/native-lexer-wasm.js',
    'src/wasm_lexer.cpp',
    'tests/native-lexer.mjs',
    'lexer.py',
    'epp.py',
    'include/vault.hpp',
    'src/vault.cpp',
    'js/libraries.js',
    'js/vault.js',
    'js/keyboard.js',
    'js/ideas.js',
    'js/a11y.js',
    'js/pictures.js'
  ];
  const mustNotHave = ['js/game-library.js', 'js/draw-library.js', 'examples/drawing.eppla', 'examples/image.eppla'];

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

  // Every library has to stay described, even the ones this build hides, so the
  // page can explain where they went. Keyboard, Time and ImprovedWaitLite are
  // all usable inside the bundle; Game and ImprovedWait are not.
  const registry = fs.readFileSync(path.join(STAGE, 'js', 'libraries.js'), 'utf8');
  const parser = fs.readFileSync(path.join(STAGE, 'js', 'parser.js'), 'utf8');
  const interpreter = fs.readFileSync(path.join(STAGE, 'js', 'interpreter.js'), 'utf8');
  if (!registry.includes("Libraries.applyBuild('distribution')") || parser.includes('return EPP.AST.DefineSprite(') || parser.includes('EPP.AST.MoveSprite(') || interpreter.includes('this.onSprite')) {
    throw new Error('The standalone JavaScript core still enables Draw.');
  }
  for (const name of ['Keyboard', 'ImprovedWaitLite', 'ImprovedWait', 'Game', 'Draw', 'Colors']) {
    if (!registry.includes('    ' + name + ': {')) {
      throw new Error('js/libraries.js no longer describes the ' + name + ' library');
    }
  }

  // The two-build split lives in js/libraries.js. If that table drifts, the zip
  // would ship the wrong half of the game tooling without anything failing.
  const builds = registry.match(/var BUILD_LIBRARIES = \{([\s\S]*?)\n  \};/);
  if (!builds) throw new Error('js/libraries.js no longer declares BUILD_LIBRARIES');
  const studioLine = (builds[1].match(/studio:\s*\[([^\]]*)\]/) || [])[1] || '';
  const zipLine = (builds[1].match(/distribution:\s*\[([^\]]*)\]/) || [])[1] || '';
  const listed = (line) => line.split(',').map((n) => n.trim().replace(/['"]/g, '')).filter(Boolean);

  if (!listed(studioLine).includes('ImprovedWaitLite')) {
    throw new Error('the Studio build must hide ImprovedWaitLite');
  }
  for (const name of ['Game', 'ImprovedWait', 'Draw', 'Colors']) {
    if (!listed(zipLine).includes(name)) {
      throw new Error('the E++.zip build must hide ' + name);
    }
  }
  if (listed(zipLine).includes('ImprovedWaitLite')) {
    throw new Error('ImprovedWaitLite belongs in E++.zip, not in the hidden list');
  }

  // And the page must actually consult that table rather than a hard-coded list.
  if (!page.includes('.applyBuild(') || !page.includes('EPP_DISTRIBUTION')) {
    throw new Error('index.html no longer applies the build library split');
  }
  if (!page.includes('function applyBuildLibraries(')) {
    throw new Error('index.html no longer defines applyBuildLibraries()');
  }

  log('verified ' + listing.length + ' files: Keyboard + ImprovedWaitLite in, Draw + Game + ImprovedWait + Colors out');
}

copyIntoStage();
dropExamplesThatNeedMissingLibraries();
stripDrawFromStandaloneCore();
stripColorsFromDistribution();
stampDistributionFlag();
buildArchive();
verifyArchive();
console.log('\nE++.zip is ready.');
