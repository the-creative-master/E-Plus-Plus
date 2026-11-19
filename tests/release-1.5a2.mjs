/**
 * E++ 1.5a2 — conditions that say "and", "or" and "not".
 *
 * One release, five engines. This file checks the same six promises in
 *   1. the JavaScript core the tests and standalone generator use,
 *   2. the Studio's inline evaluator (taken straight out of index.html),
 *   3. the Python command-line runner,
 *   4. the native C++ command-line engine (when it has been built), and
 *   5. the legacy pure-code standalone export.
 *
 * Plus the release itself: version, catalogue, docs, news and the example.
 *
 * Run: node tests/release-1.5a2.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }
function read(file) { return readFileSync(join(root, file), 'utf8'); }

// ------------------------------------------------------------------
// 1. The JavaScript core.
// ------------------------------------------------------------------
console.log('1.5a2: JavaScript core');
const context = vm.createContext({
  console, setTimeout, clearTimeout, Promise, Math, JSON, Date, Map, Set, Error,
  Number, String, Array, Object, RegExp, Uint8Array, Uint32Array, DataView,
  TextEncoder, TextDecoder, Symbol
});
context.window = context;
context.globalThis = context;
for (const file of ['errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'keyboard.js',
  'parser.js', 'python-runner.js', 'interpreter.js', 'diagnostics.js']) {
  vm.runInContext(read('js/' + file), context, { filename: file });
}
const EPP = context.EPP;

async function run(source, options) {
  const output = [];
  await EPP.run(source, Object.assign({
    delay: async () => {},
    output: (text) => output.push(String(text)),
    input: async () => ''
  }, options || {}));
  return output;
}
async function rejects(source, code) {
  try { await run(source); } catch (error) {
    assert.equal(error.code, code, JSON.stringify(source) + ' -> ' + code + ' (got ' + error.code + ')');
    return error;
  }
  assert.fail('Expected ' + code + ' from ' + JSON.stringify(source));
}

{
  assert.deepEqual(await run(
    "let 'score' be 10\nlet 'lives' be 3\n" +
    "if 'score' is at least 10 and 'lives' is greater than 0 then say \"Play on!\""), ['Play on!']);
  assert.deepEqual(await run(
    "let 'score' be 10\nlet 'lives' be 0\n" +
    "if 'score' is at least 10 and 'lives' is greater than 0 then say \"Play on!\""), []);
  ok('and needs both conditions, in every comparison wording');

  assert.deepEqual(await run(
    "let 'day' be \"Sunday\"\n" +
    "if 'day' is \"Saturday\" or 'day' is \"Sunday\" then say \"Weekend!\""), ['Weekend!']);
  assert.deepEqual(await run(
    "let 'day' be \"Monday\"\n" +
    "if 'day' is \"Saturday\" or 'day' is \"Sunday\" then say \"Weekend!\""), []);
  ok('or needs either condition');

  assert.deepEqual(await run("let 'ready' be false\nif not 'ready' then say \"Not yet\""), ['Not yet']);
  assert.deepEqual(await run("let 'ready' be true\nif not 'ready' then say \"Not yet\""), []);
  ok('not turns one condition around');

  assert.deepEqual(await run('if 1 is 2 or 3 is 3 and 4 is 4 then say "precedence"'), ['precedence']);
  assert.deepEqual(await run('if 3 is 3 and 1 is 2 or 4 is 4 then say "precedence"'), ['precedence']);
  assert.deepEqual(await run('if (1 is 2 or 3 is 3) and 4 is 4 then say "grouped"'), ['grouped']);
  assert.deepEqual(await run('if not (1 is 2 or 3 is 2) then say "not-grouped"'), ['not-grouped']);
  assert.deepEqual(await run('if (1 plus 2) is 3 then say "maths brackets"'), ['maths brackets']);
  ok('and binds tighter than or; brackets group conditions but still group maths');

  // A false `and` / true `or` must not evaluate the other half at all.
  assert.deepEqual(await run("let 'ready' be false\nif 'ready' and 'undefined' is 1 then say \"no\""), []);
  assert.deepEqual(await run("let 'ready' be true\nif 'ready' or 'undefined' is 1 then say \"yes\""), ['yes']);
  ok('short-circuiting leaves the other half alone');

  const loop = await run(
    "let 'n' be 0\nwhile 'n' is less than 3 and true do\n" +
    "  say 'n'\n  let 'n' be 'n' plus 1\nend while");
  assert.deepEqual(loop, ['0', '1', '2']);
  assert.deepEqual(await run(
    "let 'n' be 0\nrepeat until 'n' is 3 or false\n" +
    "  let 'n' be 'n' plus 1\nend repeat\nsay 'n'"), ['3']);
  assert.deepEqual(await run(
    "let 'ready' be 1\nlet 'n' be 3\nwait until 'ready' is 1 and 'n' is 3\nsay \"Waited\""), ['Waited']);
  ok('while, repeat until and wait until all read joined conditions');

  // Words that belonged to another sentence still belong to it.
  assert.deepEqual(await run(
    "let 'a' be 5\nif 'a' is greater than or equal to 5 and 'a' is less than or equal to 5 then say \"boundary\""),
    ['boundary']);
  ok('"or equal to" is still part of a comparison, not a join');

  const dangling = await rejects("if 1 is 1 and then say \"x\"", 'E078');
  assert.equal(dangling.name, 'Dangling Condition', 'the JS core uses the catalogue name');
  await rejects('if not then say "x"', 'E078');
  await rejects("if 1 is 1 or or 2 is 2 then say \"x\"", 'E078');
  ok('a dangling and / or / not is E078 with its catalogue name');
}

// ------------------------------------------------------------------
// 2. The Studio's inline evaluator, read from index.html.
// ------------------------------------------------------------------
console.log('\n1.5a2: Studio engine');
{
  const lines = read('index.html').split('\n');
  const start = lines.findIndex((line) => line.startsWith('class EppEvaluator'));
  const end = lines.findIndex((line, index) => index > start && line === '}');
  assert.ok(start >= 0 && end > start, 'the Studio evaluator class is in index.html');
  const studio = vm.createContext({
    console, Promise, Math, Date, Number, String, Object, Array, Set, Map, JSON, RegExp, Boolean,
    window: {}, document: { getElementById: () => null },
    activeEvaluator: null,
    ensureKeyTracker: () => ({ isDown: () => false }),
    appendConsoleLine: () => {}, currentFileName: 'probe.enpp',
    updateConsoleHint: () => {}, nextFrame: async () => {}, showGamePane: () => {},
    EPP: { NativeLexer: { tokenize: () => [] }, Libraries: { isAvailable: () => true } }
  });
  studio.globalThis = studio;
  vm.runInContext(lines.slice(start, end + 1).join('\n') +
    '\nglobalThis.__EppEvaluator = EppEvaluator;', studio);
  const ev = new studio.__EppEvaluator();
  // Only the logic is under test here: expressions are resolved by a small
  // stand-in so the harness needs no browser DOM or native lexer.
  ev.evalExpr = async (expr) => {
    const text = String(expr).trim();
    if (/^'[^']*'$/.test(text)) return ev.vars[text.slice(1, -1).toLowerCase()];
    if (/^"[^"]*"$/.test(text)) return text.slice(1, -1);
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return 0;
  };
  ev.requireLib = () => {};
  ev.diagnostic = function (code, name, reason) {
    const error = new Error(code + ': ' + reason); error.code = code; error.name = name; throw error;
  };
  ev.vars = { score: 10, lives: 3, day: 'Sunday', ready: false };

  assert.equal(ev.splitCondition("'a' is greater than or equal to 2"), null);
  assert.equal(ev.splitCondition("'a' is between 1 and 6"), null);
  assert.equal(ev.splitCondition("'a' is the minimum of 3 and 9"), null);
  assert.equal(ev.splitCondition("'a' is 1 and concat it with 2"), null);
  ok('phrase connectors ("or equal to", "between ... and ...") are not joins');

  // Arrays from the vm realm are compared as text, not by prototype identity.
  const joined = ev.splitCondition("'a' is 1 or 'b' is 2 and 'c' is 3");
  assert.equal(joined.ops.join(','), 'or,and');
  assert.equal(ev.splitCondition("('a' is 1 or 'b' is 2) and 'c' is 3").ops.join(','), 'and');
  ok('the Studio splits joins but respects brackets');

  for (const [text, expected] of [
    ["'score' is at least 10 and 'lives' is greater than 0", true],
    ["'score' is 10 and 'lives' is 99", false],
    ["'day' is \"Saturday\" or 'day' is \"Sunday\"", true],
    ['not \'ready\'', true],
    ['1 is 2 or 3 is 3 and 4 is 4', true],
    ["('a' is 1 or 3 is 3) and 'score' is 10", true],
    ["'score' is greater than or equal to 10 and 'lives' is 3", true],
    ["check if 'score' is a number and 'lives' is a number", true]
  ]) {
    assert.equal(await ev.evalCondition(text, 1, text), expected, 'Studio: ' + text);
  }
  ok('and / or / not, groups, precedence and the Studio check-if prefix all agree');

  for (const bad of ["'score' is 10 and", 'not', "'score' is 10 or or 'lives' is 3"]) {
    await assert.rejects(() => ev.evalCondition(bad, 1, bad), (error) => error.code === 'E078');
  }
  ok('the Studio raises E078 for a dangling connector');

  // A standalone Studio `check if` line uses the same evaluator, so two type
  // checks can be joined without repeating a second statement.
  ev.tokensFor = () => [{ lexeme: 'check' }];
  const checkOutput = [];
  await ev.execStatement(
    "check if 'score' is a number and check if 'lives' is a number", 1,
    (text) => checkOutput.push(text), async () => '');
  assert.deepEqual(checkOutput, ['true']);
  ok('a standalone Studio check-if line joins two type checks');
}

// ------------------------------------------------------------------
// 3 & 4. The two command-line engines, on the real release example.
// ------------------------------------------------------------------
const example = read('examples/12_compound_conditions.enpp');
const expectedExample = [
  'Play on!', 'It is the weekend!', 'Not ready yet', 'Grouped',
  'Round 0', 'Round 1', 'Round 2', 'Count is 5', 'Everything is true.'
];
function cli(name, command, args, source) {
  const result = spawnSync(command, [...args, '-e', source], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, name + ' failed: ' + (result.stdout || '') + (result.stderr || ''));
  return (result.stdout || '').trim().split('\n').filter(Boolean);
}
console.log('\n1.5a2: Python engine');
{
  assert.deepEqual(cli('epp.py', 'python3', [join(root, 'epp.py')], example), expectedExample);
  ok('epp.py runs the whole compound-conditions example');
  assert.deepEqual(cli('epp.py', 'python3', [join(root, 'epp.py')],
    "let 'a' be 5\nif 'a' is greater than or equal to 5 and 'a' is less than or equal to 5 then say \"boundary\""),
    ['boundary']);
  ok('epp.py keeps "or equal to" inside its comparison');
  const bad = spawnSync('python3', [join(root, 'epp.py'), '-e', 'if 1 is 2 and then say "x"'],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /E078/);
  ok('epp.py reports E078 for a dangling and');
}
console.log('\n1.5a2: native engine');
if (existsSync(join(root, 'epp'))) {
  assert.deepEqual(cli('epp', join(root, 'epp'), [], example), expectedExample);
  ok('./epp runs the whole compound-conditions example');
  const bad = spawnSync(join(root, 'epp'), ['-e', 'if 1 is 2 and then say "x"'],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /E078: Dangling Condition/);
  ok('./epp reports E078: Dangling Condition');
} else {
  console.log('  • skipped: run `make` first to test the native engine too');
}

// ------------------------------------------------------------------
// 5. The legacy pure-code standalone export.
// ------------------------------------------------------------------
console.log('\n1.5a2: standalone export');
{
  const generator = require('../js/standalone-generator.js');
  const html = generator.generateStandaloneHtml('say "hi"');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const standalone = vm.createContext({
    console, Promise, Math, JSON, Date, Map, Set, Error, Number, String, Array,
    Object, RegExp, setTimeout
  });
  standalone.window = standalone;
  standalone.globalThis = standalone;
  for (const script of scripts) {
    if (/document\.|window\.addEventListener|btnRun|editor/.test(script)) continue;
    vm.runInContext(script, standalone, { filename: 'generated' });
  }
  const SEPP = standalone.EPP;
  async function standaloneRun(source) {
    const output = [];
    const program = new SEPP.StandaloneParser(source).parse();
    await new SEPP.StandaloneInterpreter({
      output: (text) => output.push(String(text)), input: async () => ''
    }).run(program);
    return output;
  }
  assert.deepEqual(await standaloneRun(
    "Define 'score' as 10\nDefine 'lives' as 3\n" +
    "if 'score' is equal to 10 and 'lives' is greater than 0 then say \"Play\""), ['Play']);
  assert.deepEqual(await standaloneRun(
    "Define 'day' as \"Sunday\"\n" +
    "if 'day' is equal to \"Saturday\" or 'day' is equal to \"Sunday\" then say \"Weekend\""), ['Weekend']);
  assert.deepEqual(await standaloneRun("Define 'ready' as 0\nif not 'ready' then say \"Not yet\""), ['Not yet']);
  ok('the pure-code export parses and runs and / or / not too');

  for (const bad of [
    'if 1 is equal to 1 and then say "x"',
    'if 1 is equal to 1 or then say "x"',
    'if not then say "x"'
  ]) {
    let error;
    try { new SEPP.StandaloneParser(bad).parse(); } catch (caught) { error = caught; }
    assert.equal(error && error.code, 'E078', 'standalone: ' + bad);
    assert.equal(error && error.name, 'Dangling Condition', 'standalone: ' + bad);
  }
  ok('the pure-code export names a dangling connector E078 too');
}

// ------------------------------------------------------------------
// 6. lexer.py is a language tool, not only the Python runner's lexer.
// ------------------------------------------------------------------
console.log('\n1.5a2: lexer.py as a standalone tool');
{
  const lexerPy = join(root, 'lexer.py');
  const example = join(root, 'examples', '12_compound_conditions.enpp');
  const runLexer = (args) => spawnSync('python3', [lexerPy, ...args],
    { cwd: root, encoding: 'utf8', timeout: 10000 });

  const legacy = runLexer([join(root, 'examples', '01_hello.enpp')]);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.match(legacy.stdout, /Token\(KW_SAY/);
  ok('the legacy bare-file form still prints tokens');

  const keywords = runLexer(['keywords', '--json']);
  assert.equal(keywords.status, 0, keywords.stderr);
  const catalogue = JSON.parse(keywords.stdout);
  assert.ok(catalogue.some((entry) => entry.word === 'and' && entry.token_type === 'KW_AND'));
  assert.ok(catalogue.some((entry) => entry.word === 'or' && entry.token_type === 'KW_OR'));
  assert.ok(catalogue.some((entry) => entry.word === 'not' && entry.token_type === 'KW_NOT'));
  ok('keywords lists the word catalogue as JSON');

  const checked = runLexer(['check', example]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /no lexer errors/);
  const checkedJson = runLexer(['check', example, '--json']);
  assert.equal(JSON.parse(checkedJson.stdout).ok, true);
  const badDir = mkdtempSync(join(tmpdir(), 'epp-lexer-'));
  const badFile = join(badDir, 'bad.enpp');
  writeFileSync(badFile, 'say "unterminated\n');
  const bad = runLexer(['check', badFile, '--json']);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).code, 'F004');
  ok('check reports lexer errors without running the program');

  const tokens = runLexer(['tokens', example, '--json', '--no-eof']);
  assert.equal(tokens.status, 0, tokens.stderr);
  const tokenRows = JSON.parse(tokens.stdout);
  assert.equal(tokenRows[0].type, 'KW_NOTE');
  assert.ok(tokenRows.some((token) => token.type === 'KW_AND'));
  assert.ok(!tokenRows.some((token) => token.type === 'EOF'));
  ok('tokens exports the token stream as JSON');

  const stats = runLexer(['stats', example, '--json']);
  assert.equal(stats.status, 0, stats.stderr);
  const statRows = JSON.parse(stats.stdout);
  assert.ok(statRows.variables.includes('Score'));
  assert.ok(statRows.by_type.KW_AND >= 1);
  ok('stats counts tokens, keywords, variables and strings');

  const highlighted = runLexer(['highlight', join(root, 'examples', '01_hello.enpp'), '--format', 'html']);
  assert.equal(highlighted.status, 0, highlighted.stderr);
  assert.match(highlighted.stdout, /tok-kw_say/);
  assert.match(highlighted.stdout, /tok-string/);
  ok('highlight renders token colours for a web page');

  const keygen = runLexer(['keygen', '--out', join(badDir, 'epp-keys.json'), '--name', 'test-key']);
  assert.equal(keygen.status, 0, keygen.stderr);
  const keyHex = keygen.stdout.match(/key \(hex\): ([0-9a-f]{64})/)[1];
  const plain = join(badDir, 'plain.enpp');
  writeFileSync(plain, 'say "sealed hello"\n');
  const sealed = join(badDir, 'sealed.epp');
  assert.equal(runLexer(['seal', plain, '--key', keyHex, '--out', sealed]).status, 0);
  assert.equal(runLexer(['is-vault', sealed]).status, 0);
  assert.equal(runLexer(['is-vault', plain]).status, 1);
  const opened = join(badDir, 'opened.enpp');
  assert.equal(runLexer(['open', sealed, '--key', keyHex, '--out', opened]).status, 0);
  assert.equal(readFileSync(opened, 'utf8'), 'say "sealed hello"\n');
  assert.equal(runLexer(['check', sealed, '--key', keyHex]).status, 0);
  rmSync(badDir, { recursive: true, force: true });
  ok('keygen, seal, open and is-vault round-trip a sealed project');

  const api = spawnSync('python3', ['-c',
    "import lexer; print(lexer.check_source('say \"hi\"\\n', 'x.enpp')['ok']); " +
    "print(lexer.keyword_catalogue()[0]['word']); " +
    "print(lexer.source_stats('let \\'n\\' be 1\\n', 'x.enpp')['variables'])"],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(api.status, 0, api.stderr);
  assert.match(api.stdout, /True\na\n\['n'\]/);
  ok('lexer.py is importable as a library too');
}

// ------------------------------------------------------------------
// 7. The release ships as one piece.
// ------------------------------------------------------------------
console.log('\n1.5a2: the release ships as one piece');
{
  const errors = require('../js/errors.js');
  assert.equal(EPP.VERSION, '1.5a2');
  assert.equal(errors.Errors.total, 104);
  assert.equal(errors.Errors.name('E078'), 'Dangling Condition');
  ok('the engine reports 1.5a2 and the catalogue has 104 codes');

  const reference = read('LANGUAGE.md');
  assert.match(reference, /\(1\.5a2\)/);
  for (const phrase of ['and', 'or', 'not', 'E078', 'Saying two things at once']) {
    assert.ok(reference.includes(phrase), 'LANGUAGE.md documents ' + phrase);
  }
  const wiki = read('WIKI.md');
  assert.match(wiki, /^# E\+\+ 1\.5a2 Wiki/m);
  assert.ok(wiki.includes('Tutorial: two things at once'));
  const news = read('news.html');
  assert.match(news, /RELEASE 1\.5a2/);
  assert.ok(news.includes('PREVIOUS RELEASE · E++ 1.5a1'));
  const studio = read('index.html');
  assert.ok(studio.includes("const DEFAULTS_VERSION = '1.5a2';"));
  assert.ok(studio.includes("name: 'compound_conditions.enpp'"));
  const readme = read('README.md');
  assert.match(readme, /^# E\+\+ 1\.5a2/m);
  assert.ok(readme.includes('E078'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.5.2');
  assert.ok(pkg.scripts.test.includes('release-1.5a2.mjs'));
  assert.ok(existsSync(join(root, 'examples', '12_compound_conditions.enpp')));
  assert.match(read('CMakeLists.txt'), /project\(EPlusPlus VERSION 1\.5\.2/);
  assert.match(read('src/main.cpp'), /E\+\+ Programming Language \[1\.5a2\]/);
  assert.match(read('src/main.cpp'), /1\.5a2 conditions/);
  assert.match(read('epp.py'), /E\+\+ \[1\.5a2\] Python Direct Engine/);
  assert.match(read('epp.py'), /1\.5a2 additions/);
  assert.match(read('lexer.py'), /1\.5a2 Lexer module loaded/);
  assert.match(read('wiki.html'), /E\+\+ 1\.5a2 Wiki/);
  assert.match(news, /<title>E\+\+ News \| 1\.5a2<\/title>/);
  assert.match(studio, /<title>E\+\+ Studio \| 1\.5a2<\/title>/);
  assert.match(studio, /class="build-badge">1\.5a2</);
  assert.match(studio, /id="buildVersion">v1\.5a2/);
  ok('docs, news, wiki, Studio, CLI help, CMake and package all say 1.5a2');
}

console.log('\nAll ' + passed + ' E++ 1.5a2 checks passed.');
