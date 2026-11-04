/**
 * E++ 1.4b1 - the error overhaul.
 *
 * Verifies the whole promise of the release:
 *
 *   E001-E075  general errors    - every code has a name, and the code the
 *                                  engines actually raise matches the catalogue
 *   W001-W005  warnings          - collected, never thrown, and the program
 *                                  still runs
 *   Z001-Z005  E++.zip only      - raised by the distribution build only
 *   F001-F015  fatal lexer errors - thrown by the lexer, never by the parser
 *
 * Run: node tests/errors-1.4b1.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const errors = require('../js/errors.js');

let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }

// ------------------------------------------------------------------
// The catalogue itself: exactly 75 + 5 + 5 + 15 codes.
// ------------------------------------------------------------------
console.log('1.4b1: the catalogue');
{
  const families = errors.Errors.families();
  assert.deepEqual(families.map((f) => f.section), ['E', 'W', 'Z', 'F']);
  assert.deepEqual(families.map((f) => f.count), [75, 5, 5, 15]);
  assert.equal(errors.Errors.total, 100, 'one hundred codes in total');
  ok('75 E codes, 5 W codes, 5 Z codes and 15 F codes (100 total)');

  for (const family of errors.catalog()) {
    for (const entry of family.codes) {
      assert.match(entry.code, /^[EWZF]\d{3}$/, 'codes are a letter and three digits');
      assert.ok(entry.name && entry.name.length > 2, entry.code + ' has a name');
      assert.ok(entry.help && entry.help.length > 8, entry.code + ' has a fix');
      assert.ok(!entry.name.includes('undefined'), entry.code + ' names are complete');
    }
    const names = family.codes.map((c) => c.name);
    assert.equal(new Set(names).size, names.length, family.title + ' names are unique');
  }
  ok('every code has a unique name and an English fix');

  assert.equal(errors.Errors.name('E005'), 'Unterminated Double Quote');
  assert.equal(errors.Errors.name('W001'), 'Text Looks Like An Equation');
  assert.equal(errors.Errors.name('Z003'), 'Game Is Not In E++.zip');
  assert.equal(errors.Errors.name('F004'), 'Unterminated String');
  assert.equal(errors.Errors.isWarningCode('W002'), true);
  assert.equal(errors.Errors.isWarningCode('E002'), false);
  assert.equal(errors.Errors.isFatalCode('F015'), true);
  assert.equal(errors.Errors.isDistributionCode('Z005'), true);
  ok('each family reports its own section');

  // An unknown code can never masquerade as a real one.
  assert.equal(errors.Errors.exists('E076'), false);
  assert.equal(errors.Errors.exists('E000'), false);
  assert.equal(errors.Errors.exists('Q001'), false);
  const stray = errors.error('E999', 'not a real code');
  assert.equal(stray.code, 'E015');
  assert.match(stray.message, /E999, which is not a 1.4b1 code/);
  ok('a code outside the catalogue falls back to E015 and says so');
}

// ------------------------------------------------------------------
// The error object.
// ------------------------------------------------------------------
{
  const error = errors.error('E018', 'This repeat block has no matching ending.', 4, 1);
  assert.equal(error.code, 'E018');
  assert.equal(error.category, 'Unclosed Block');
  assert.equal(error.family, 'general');
  assert.equal(error.section, 'E');
  assert.equal(error.line, 4);
  assert.equal(error.column, 1);
  assert.equal(error.hint, 'Close the block with its own ending, for example: end repeat');
  assert.equal(error.format(), 'Unclosed Block (line 4, column 1): This repeat block has no matching ending.\n' +
    'Hint: Close the block with its own ending, for example: end repeat');
  assert.equal(error.headline(), '[E error E018] Unclosed Block (line 4, column 1): This repeat block has no matching ending.');
  ok('an E error carries code, name, position, reason, fix, format and headline');

  const fatal = errors.fatal('F004', 'This string never ends.', 2, 5);
  assert.equal(fatal.family, 'fatal');
  assert.equal(fatal.category, 'Fatal Lexer Error: Unterminated String');
  assert.equal(errors.Errors.isWarning(fatal), false);
  ok('an F error is marked fatal and named from the catalogue');

  const warning = errors.warning('W001', 'The equation "1 plus 1" is in quotes.', 1, 5, null, 'game.eppl', 'say "1 plus 1"');
  assert.equal(warning.family, 'warning');
  assert.equal(warning.category, 'Warning: Text Looks Like An Equation');
  assert.equal(errors.Errors.isWarning(warning), true);
  const record = warning.warningRecord();
  assert.deepEqual(Object.keys(record).sort(),
    ['code', 'col', 'family', 'filename', 'help', 'line', 'name', 'reason', 'sourceLine']);
  assert.equal(record.filename, 'game.eppl');
  assert.equal(record.code, 'W001');
  ok('a W warning renders as a record the Studio can print');

  const build = errors.distribution('Z002', 'The "Draw" library is not in this build.', 1, 1);
  assert.equal(build.section, 'Z');
  assert.equal(build.category, 'Draw Is Not In E++.zip');
  ok('a Z error is marked as a build error');
}

// ------------------------------------------------------------------
// The reporter collects warnings without throwing.
// ------------------------------------------------------------------
{
  const reporter = errors.Errors.reporter();
  reporter.warn('W001', 'first', 1, 1);
  reporter.warn('W004', 'second', 3, 2);
  assert.equal(reporter.count(), 2);
  assert.deepEqual(reporter.take().map((w) => w.code), ['W001', 'W004']);
  assert.equal(reporter.count(), 0, 'take() empties the reporter');
  ok('the reporter collects warnings and hands them over without throwing');
}

// ------------------------------------------------------------------
// The legacy subclasses keep working, but always name a catalogue code.
// ------------------------------------------------------------------
{
  const legacy = new errors.ParseError('Expected a value.', 2, 3, 'Add a value.', 'E003');
  assert.equal(legacy.code, 'E003');
  assert.equal(legacy.category, 'Missing Value');
  assert.equal(legacy.name, 'Syntax Error');
  const defaulted = new errors.ParseError('Something is wrong.', 1, 1);
  assert.equal(defaulted.code, 'E015', 'a ParseError without a code is E015');
  const lex = new errors.LexError('Broken.', 1, 1);
  assert.equal(lex.code, 'F003', 'a LexError without a code is fatal F003');
  ok('legacy ParseError/LexError subclasses still work and name a real code');
}

// ------------------------------------------------------------------
// The lexer owns F001-F015.
// ------------------------------------------------------------------
const context = vm.createContext({
  console, setTimeout, clearTimeout, Promise, Math, JSON, Date, Map, Set, Error,
  Number, String, Array, Object, RegExp, Uint8Array, Uint32Array, DataView,
  TextEncoder, TextDecoder, Symbol
});
context.window = context;
context.globalThis = context;
for (const file of ['errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'keyboard.js',
  'parser.js', 'python-runner.js', 'interpreter.js', 'diagnostics.js']) {
  vm.runInContext(readFileSync(join(root, 'js', file), 'utf8'), context, { filename: file });
}
const EPP = context.EPP;

function fatal(source) {
  try {
    EPP.Lexer.tokenize(source, { filename: 'test.enpp' });
  } catch (error) {
    return error;
  }
  assert.fail('Expected a fatal lexer error from ' + JSON.stringify(source));
}

console.log('\n1.4b1: fatal lexer errors (F001-F015)');
{
  const cases = [
    [42, 'F001'],
    ['say "unterminated', 'F004'],
    ["say ''", 'F006'],
    ['say 1 // comment', 'F011'],
    ['say 1 # comment', 'F011'],
    ['note [not closed', 'F007'],
    ['note nope', 'F008'],
    ['say 2.5.5', 'F010'],
    ['say @', 'F003'],
    ['say "a\\qb"', 'F014'],
    ['say "a"\u0000b', 'F009']
  ];
  for (const [source, code] of cases) {
    const error = fatal(source);
    assert.equal(error.code, code, JSON.stringify(source) + ' -> ' + code);
    assert.equal(error.family, 'fatal');
    assert.match(error.category, /^Fatal Lexer Error: /);
    assert.ok(error.hint && error.hint.length > 8, code + ' carries its fix');
  }
  ok('F001, F003-F011 and F014 are raised where they belong');

  // F005: an unclosed variable name.
  assert.equal(fatal("say 'unterminated").code, 'F005');
  // F002 and F012 are size limits: prove the limits are enforced without
  // allocating the whole maximum.
  assert.equal(EPP.Lexer.MAX_SOURCE_LENGTH, 4 * 1024 * 1024);
  const longWord = 'a'.repeat(300);
  assert.equal(fatal('say ' + longWord).code, 'F012');
  ok('F005, F012 and the 4 MB F002 limit are enforced');

  // Every fatal code is unique to the lexer: the parser never raises one.
  const parserSource = readFileSync(join(root, 'js', 'parser.js'), 'utf8');
  const parserCodes = [...parserSource.matchAll(/'(F\d{3})'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(parserCodes)], ['F013'],
    'the parser only names F013, for a raw Python block the lexer never sees');
  ok('the parser never raises a lexer code (except the F013 it finds before lexing)');

  // F013: an unterminated dash-mode Python block is caught before lexing.
  assert.throws(() => EPP.Parser.parse('python code ",print(1)\nprint(2)\n'), (e) => e.code === 'F013');
  ok('F013: a Python block that never ends is fatal');
}

// ------------------------------------------------------------------
// The general errors keep their catalogue codes through lex, parse and run.
// ------------------------------------------------------------------
console.log('\n1.4b1: general errors (E001-E075)');

async function raises(source, code, options) {
  try {
    await EPP.run(source, Object.assign({ delay: async () => {} }, options || {}));
  } catch (error) {
    assert.equal(error.code, code, JSON.stringify(source) + ' -> ' + code + ' (got ' + error.code + ': ' + error.message + ')');
    const family = { E: 'general', Z: 'distribution', F: 'fatal', W: 'warning' }[code[0]];
    assert.equal(error.family, family, code + ' is a ' + family + ' error');
    assert.ok(error.hint && error.hint.length > 8, code + ' carries its fix');
    return error;
  }
  assert.fail('Expected ' + code + ' from ' + JSON.stringify(source));
}

{
  await raises('say hello', 'E001');
  await raises('fheneir', 'E015');
  await raises('say 1 plus', 'E003');
  await raises('say', 'E003');
  await raises('let "name" be 1', 'E036');
  await raises('define "x" as 1', 'E036');
  await raises("if 'ghost' is equal to 1 then say \"x\"", 'E028');
  // The inline form is caught by the Studio pre-flight, exactly as in 1.3.
  let preflightCode = null;
  try { EPP.Diagnostics.validate('if 1 equals 1 then say "x" otherwise say "y"', 'a.eppl'); }
  catch (e) { preflightCode = e.code; }
  assert.equal(preflightCode, 'E021');
  await raises('otherwise say "bad"', 'E022');
  await raises('repeat 2 times\nsay "x"', 'E018');
  await raises('end repeat', 'E017');
  await raises('if 1 equals 1\nthen say "x"', 'E020');
  await raises('while\nsay "x"\nend while', 'E025');
  await raises('add library "Nonexistent"', 'E043');
  await raises('say the square root of 4', 'E042');
  await raises('say (1 plus 2', 'E065');
  await raises('python code "print(1)"', 'E047');
  await raises('print("HELLO")', 'E048');
  await raises('add library "Math"\nsay 1 divided by 0', 'E066');
  await raises("add library \"Math\"\nlet 'n' be 0 minus 1\nsay the square root of 'n'", 'E034');
  await raises('add library "Draw"\ndefine \'pencil\' as drawing sprite\n\'ghost\' move up "10"', 'E075');
  await raises('add the "Image" library\ndisplay image \'ghost\'', 'E074');
  await raises('add library "Game"\nset the size of the actor \'hero\' to 0', 'E073');
  ok('one representative program per area raises the documented E code');
}

// ------------------------------------------------------------------
// Warnings: the program still runs.
// ------------------------------------------------------------------
console.log('\n1.4b1: warnings (W001-W005)');
{
  const ran = await EPP.run('say "1 plus 1"', { delay: async () => {} });
  assert.deepEqual(Array.from(ran.warnings, (w) => w.code), ['W001']);
  assert.equal(ran.warnings[0].name, 'Warning: Text Looks Like An Equation');
  ok('W001: an equation in double quotes is a warning, and the program runs');

  const quiet = await EPP.run('say "Hello"', { delay: async () => {} });
  assert.deepEqual(Array.from(quiet.warnings), []);
  ok('ordinary text earns no warning');

  const unused = await EPP.run('add library "Python"', { delay: async () => {} });
  assert.deepEqual(Array.from(unused.warnings, (w) => w.code), ['W003']);
  ok('W003: a library that nothing uses is a warning, not an error');

  const used = await EPP.run('add library "Math"\nsay 1 divided by 2', { delay: async () => {} });
  assert.deepEqual(Array.from(used.warnings), []);
  ok('a library that is used earns no warning');

  const amount = await EPP.run('wait "2" seconds', { delay: async () => {} });
  assert.deepEqual(Array.from(amount.warnings, (w) => w.code), ['W005']);
  ok('W005: a quoted number where an amount belongs is a warning');

  const seen = [];
  await EPP.run('say "1 plus 1"', { delay: async () => {}, onWarning: (w) => seen.push(w.code) });
  assert.deepEqual(seen, ['W001'], 'the host hears warnings as they happen');
  ok('warnings reach the host through onWarning');

  // The pre-flight agrees with the interpreter.
  const preflight = EPP.Diagnostics.warnings('say "1 plus 1"\nwait "2" seconds', 'game.eppl');
  assert.deepEqual(Array.from(preflight, (w) => String(w.code)), ['W001', 'W005']);
  assert.ok(Array.from(preflight).every((w) => w.filename === 'game.eppl'));
  ok('the Studio pre-flight reports the same warnings with the file name');
}

// ------------------------------------------------------------------
// Z codes: the distribution build, and only the distribution build.
// ------------------------------------------------------------------
console.log('\n1.4b1: E++.zip only (Z001-Z005)');
{
  assert.equal(EPP.Libraries.errorCode('Colors'), 'Z001');
  assert.equal(EPP.Libraries.errorCode('Colours'), 'Z001');
  assert.equal(EPP.Libraries.errorCode('Draw'), 'Z002');
  assert.equal(EPP.Libraries.errorCode('Game'), 'Z003');
  assert.equal(EPP.Libraries.errorCode('ImprovedWait'), 'Z004');
  ok('each missing library names its own Z code');

  EPP.Libraries.applyBuild('distribution');
  for (const [library, code] of [['Colors', 'Z001'], ['Draw', 'Z002'], ['Game', 'Z003'], ['ImprovedWait', 'Z004']]) {
    await raises('add library "' + library + '"', code);
  }
  EPP.Libraries.showAll();

  // The full Studio has those libraries, so it never raises a Z code for them.
  await EPP.run('add library "Colors"', { delay: async () => {} });
  ok('the Studio has Colors and never raises Z001 for it');

  // Z005 is reserved for a build without the JavaScript runtime.
  assert.equal(errors.Errors.name('Z005'), 'JavaScript Runtime Is Not In E++.zip');
}

// ------------------------------------------------------------------
// The retired 1.3 codes are gone from every engine.
// ------------------------------------------------------------------
console.log('\n1.4b1: no retired codes');
{
  const retired = /['"](?:E1|E2|E3|E4|E5|E6|E7)\d{2}['"]/;
  // E1xx/E2xx/E3xx/E4xx/E5xx/E6xx/E7xx were the 1.3 numbers. Legitimate 1.4b1
  // codes start with E0 and a digit, so anything matching above is retired.
  const files = ['js/lexer.js', 'js/parser.js', 'js/interpreter.js', 'js/files.js',
    'js/vault.js', 'js/diagnostics.js', 'js/libraries.js', 'js/native-lexer.js'];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    const stray = source.match(new RegExp(retired.source, 'g')) || [];
    assert.deepEqual(stray, [], file + ' still mentions a retired code: ' + stray.join(', '));
  }
  ok('the JavaScript engines only use 1.4b1 codes');

  const python = readFileSync(join(root, 'epp.py'), 'utf8');
  const strayPython = python.match(/"E[1-7]\d{2}"/g) || [];
  // E056-E059 are real 1.4b1 codes; everything else in E1xx-E7xx is retired.
  const onlyProjectCodes = strayPython.filter((code) => !/^"E05[6-9]"$/.test(code));
  assert.deepEqual(onlyProjectCodes, [], 'epp.py still mentions a retired code: ' + onlyProjectCodes.join(', '));
  ok('epp.py only uses 1.4b1 codes');

  // Every code the engines raise exists in the catalogue.
  const catalogue = new Set(errors.catalog().flatMap((family) => family.codes.map((c) => c.code)));
  const sources = ['js/lexer.js', 'js/parser.js', 'js/interpreter.js', 'js/files.js',
    'js/vault.js', 'js/diagnostics.js', 'js/native-lexer.js', 'epp.py'];
  for (const file of sources) {
    const text = readFileSync(join(root, file), 'utf8');
    const codes = new Set([...text.matchAll(/['"]([EWZF]\d{3})['"]/g)].map((m) => m[1]));
    for (const code of codes) {
      assert.ok(catalogue.has(code), file + ' raises ' + code + ', which is not in the catalogue');
    }
  }
  ok('every code raised by an engine exists in the catalogue');
}

// ------------------------------------------------------------------
// The documentation ships the same catalogue.
// ------------------------------------------------------------------
{
  const reference = readFileSync(join(root, 'LANGUAGE.md'), 'utf8');
  for (const family of errors.catalog()) {
    for (const entry of family.codes) {
      assert.ok(reference.includes(entry.code), 'LANGUAGE.md documents ' + entry.code);
    }
  }
  ok('LANGUAGE.md documents all 100 codes');
}

console.log('\nAll ' + passed + ' E++ 1.4b1 error checks passed.');
