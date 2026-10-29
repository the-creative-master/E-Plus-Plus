// Run after make zip. Exercises the actual extracted artifacts, including a
// fresh native rebuild, rather than just checking the builder's source.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'epp-zip-135-'));
try {
  const outer = path.join(temp, 'outer'), inner = path.join(temp, 'inner');
  await fs.mkdir(outer); await fs.mkdir(inner);
  execFileSync('unzip', ['-q', path.join(root, 'E++.zip'), '-d', outer]);
  execFileSync('unzip', ['-q', path.join(outer, 'epp_language.zip'), '-d', inner]);
  async function verify(dir, label) {
    for (const expected of ['index.html', 'js/native-lexer-wasm.js', 'wiki.html', 'server.js', 'package.json']) {
      await fs.access(path.join(dir, expected));
    }
    for (const missing of ['js/draw-library.js', 'js/game-library.js', 'examples/15_colors_and_console.enppl', 'examples/18_animated_draw.enppl']) {
      await assert.rejects(fs.access(path.join(dir, missing)), label + ' does not ship ' + missing);
    }
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    assert(!html.includes('data-library="Colors"') && !html.includes('id="drawCanvas"'));
    assert(html.includes('window.EPP_DISTRIBUTION = true'));
    function run(executable, args, source, error) {
      const result = spawnSync(executable, [...args, '-e', source], { cwd: dir, encoding: 'utf8', timeout: 10000 });
      assert.notEqual(result.status, 0, `${label} ${executable} unexpectedly accepted ${source}`);
      assert((result.stdout + result.stderr).includes(error), `${label} ${executable}: ${result.stdout + result.stderr}`);
    }
    for (const [executable, args] of [[path.join(dir, 'epp'), []], ['python3', [path.join(dir, 'epp.py')]]]) {
      for (const name of ['Colors', 'colours', 'color', 'colour', 'Draw', 'Game']) run(executable, args, `add library "${name}"`, 'E302');
      run(executable, args, 'say red "not supported"', 'E302');
      run(executable, args, 'say hello', 'E402');
      run(executable, args, 'if 1 is 2 then say hello', 'E402');
    }
    const context = vm.createContext({ console, setTimeout, clearTimeout, Promise, Math, JSON, Date, Map, Set, Error, Number, String, Array, Object, RegExp, Uint8Array, Uint32Array, DataView, TextEncoder, TextDecoder, Symbol });
    context.window = context; context.globalThis = context;
    for (const file of ['errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'keyboard.js', 'parser.js', 'python-runner.js', 'interpreter.js', 'standalone-generator.js']) {
      vm.runInContext(await fs.readFile(path.join(dir, 'js', file), 'utf8'), context, { filename: file });
    }
    const EPP = context.EPP;
    assert.equal(EPP.Libraries.isAvailable('Colors'), false);
    assert.equal(EPP.Libraries.isAvailable('Draw'), false);
    assert.equal(EPP.Libraries.isAvailable('ImprovedWaitLite'), true);
    for (const name of ['Colors', 'colours', 'Draw']) {
      await assert.rejects(EPP.run(`add library "${name}"`), /not included/i);
      await assert.rejects(new EPP.Interpreter().executeStatement(EPP.AST.Library(name, { line: 1, column: 1 })), /not included/i);
    }
    await assert.rejects(EPP.run('say hello'), /double quotes/i);
    const legacy = EPP.generateStandaloneHtml('say hello');
    assert(!legacy.includes('cdn.jsdelivr.net'));
    assert(legacy.includes('pure-code export does not support libraries'));
  }
  await verify(outer, 'E++.zip');
  await verify(inner, 'epp_language.zip');
  const packaging = spawnSync('make', ['zip'], { cwd: outer, encoding: 'utf8' });
  assert.notEqual(packaging.status, 0);
  assert((packaging.stdout + packaging.stderr).includes('full E++ source checkout'), 'archive explains where to rebuild the release');
  execFileSync('make', ['-B', 'epp'], { cwd: outer, stdio: 'pipe' });
  for (const source of ['add library "Colors"', 'say red "blocked"']) {
    const result = spawnSync(path.join(outer, 'epp'), ['-e', source], { cwd: outer, encoding: 'utf8' });
    assert(result.status !== 0 && (result.stdout + result.stderr).includes('E302'), 'recompiled native source must still reject Colors');
  }
  console.log('Both extracted archives reject Colors/Draw/Game across JS, Python and native runtimes, including a native rebuild; strict errors remain.');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
