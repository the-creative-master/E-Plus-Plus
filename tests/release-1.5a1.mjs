/**
 * E++ 1.5a1 — waiting, deleting, repeating and plainer English.
 *
 * The release has four promises, and this file checks each one against the
 * JavaScript engine the Studio runs:
 *
 *   1. `wait until` is core E++  — no library, a deadline survives a false
 *                                  condition, and a wait inside a loop warns.
 *   2. `delete the file` works   — through the host hook, with E076 for a
 *                                  missing file and E077 when the host refuses.
 *   3. `repeat until` runs first, then tests the condition.
 *   4. Every comparison reads the way it is spoken, in all its English forms.
 *
 * Run: node tests/release-1.5a1.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }

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

/** Run a program and collect what it prints. */
async function run(source, options) {
  const output = [];
  const warnings = [];
  await EPP.run(source, Object.assign({
    delay: async () => {},
    output: (text) => output.push(String(text)),
    onWarning: (warning) => warnings.push(warning)
  }, options || {}));
  return { output, warnings };
}

async function rejects(source, code, options) {
  try {
    await run(source, options);
  } catch (error) {
    assert.equal(error.code, code,
      JSON.stringify(source) + ' -> ' + code + ' (got ' + error.code + ': ' + error.message + ')');
    return error;
  }
  assert.fail('Expected ' + code + ' from ' + JSON.stringify(source));
}

// ------------------------------------------------------------------
// 1. wait until — the headline statement.
// ------------------------------------------------------------------
console.log('1.5a1: wait until');
{
  const immediate = await run("let 'ready' be 1\nwait until 'ready' is 1\nsay \"done\"");
  assert.deepEqual(immediate.output, ['done'], 'a true condition waits no time at all');
  ok('wait until returns the moment its condition is true, with no library added');

  // The value changes while the program is waiting: the wait has to notice.
  const changed = await run(
    "let 'n' be 1\n" +
    "wait at most 2 seconds until 'n' is 3\n" +
    'say "still here"');
  assert.deepEqual(changed.output, ['still here']);
  ok('wait at most gives up quietly when the condition never becomes true');

  // A wait with no deadline and a false condition is capped, not infinite.
  const capped = await rejects("let 'n' be 1\nwait until 'n' is 3", 'E067', { waitCeilingMs: 150 });
  assert.match(capped.message, /wait/i);
  ok('wait until without a deadline stops with E067 instead of hanging');

  await rejects("wait until 'ready' is 1", 'E028');
  ok('no library line is required for wait until (only the variable has to exist)');

  const warning = await run(
    "let 'n' be 1\n" +
    'repeat 2 times\n' +
    "  wait at most 0.05 seconds until 'n' is 9\n" +
    'end repeat');
  const codes = warning.warnings.map((w) => w.code);
  assert.ok(codes.includes('W006'), 'a wait inside a loop warns with W006, got ' + JSON.stringify(codes));
  ok('W006 warns that a wait inside a loop can never be ended by that loop');

  assert.deepEqual(warning.output, [], 'a bounded wait prints nothing of its own');
}

// ------------------------------------------------------------------
// 1b. A plain pause needs no library either.
// ------------------------------------------------------------------
console.log('\n1.5a1: a plain pause is core E++');
{
  const paused = await run('wait 0.01 seconds\nsay "ok"');
  assert.deepEqual(paused.output, ['ok']);
  ok('wait 2 seconds needs no library');

  const millis = await run('wait 10 milliseconds\nsay "ok"');
  assert.deepEqual(millis.output, ['ok']);
  ok('wait 250 milliseconds works, and the unit really is milliseconds');

  const slept = await run('sleep 0.01 seconds\nsay "ok"');
  assert.deepEqual(slept.output, ['ok']);
  ok('sleep is the same statement as wait');

  // A quarter of a second must reach the host as 0.25 seconds, not 250.
  let asked = null;
  await EPP.run('wait 250 milliseconds', { delay: async (seconds) => { asked = seconds; } });
  assert.equal(asked, 0.25, '250 milliseconds is 0.25 seconds, got ' + asked);
  await EPP.run('wait 2 seconds', { delay: async (seconds) => { asked = seconds; } });
  assert.equal(asked, 2);
  ok('milliseconds are converted: 250 milliseconds asks the host for 0.25 seconds');

  // Time keeps the clock: pauses are core, the clock is not.
  // The arrays come from the vm realm, so compare them as text.
  assert.equal(EPP.Libraries.ownersOf('the current time').join(','), 'Time',
    'the current time belongs to Time alone');
  assert.equal(EPP.Libraries.ownersOf('wait statement').join(','), '',
    'no library owns a plain pause any more');
  const time = EPP.Libraries.get('Time');
  assert.ok(!/wait statement/.test(JSON.stringify(time.unlocks)),
    'Time no longer claims the wait statement');
  assert.ok(/current time/.test(JSON.stringify(time.unlocks)),
    'Time still claims the current time');
  ok('Time keeps the clock and no longer owns the plain pause');

  // The longer wait features still belong to a library.
  await rejects("wait 0.01 seconds as 't'", 'E042');
  await rejects("wait for the actor 'hero' to finish", 'E042');
  ok('named waits and actor waits still ask for their library');
}

// ------------------------------------------------------------------
// 2. delete the file — E076, E077 and the host hook.
// ------------------------------------------------------------------
console.log('\n1.5a1: delete the file');
{
  const calls = [];
  const deleted = await run('add library "Files"\ndelete the file "x.txt"', {
    deleteFile: async (path) => { calls.push(path); return null; }
  });
  assert.deepEqual(calls, ['x.txt'], 'the host is asked to delete exactly the named file');
  assert.deepEqual(deleted.output, []);
  ok('delete the file asks the host once and prints nothing');

  assert.deepEqual(calls.length, 1);
  const removed = await run('add library "Files"\nremove the file "y.txt"', {
    deleteFile: async (path) => { calls.push(path); return null; }
  });
  assert.equal(calls[1], 'y.txt', '"remove the file" is the same statement');
  assert.deepEqual(removed.output, []);
  ok('remove the file is an accepted spelling of delete the file');

  // A variable can hold the name, just like read and write.
  const viaVariable = await run('add library "Files"\nlet \'name\' be "z.txt"\ndelete the file \'name\'', {
    deleteFile: async (path) => { calls.push(path); return null; }
  });
  assert.equal(calls[2], 'z.txt');
  assert.deepEqual(viaVariable.output, []);
  ok('a variable in single quotes can name the file to delete');

  const missing = await rejects('add library "Files"\ndelete the file "gone.txt"', 'E076', {
    deleteFile: async () => 'There is no file called "gone.txt" to delete.'
  });
  assert.match(missing.message, /gone\.txt/);
  ok('a missing file is E076: Cannot Delete A Missing File');

  await rejects('add library "Files"\ndelete the file "gone.txt"', 'E077', {
    deleteFile: async () => 'permission denied'
  });
  ok('any other host failure is E077: Cannot Delete The File');

  await rejects('add library "Files"\ndelete the file "x.txt"', 'E077');
  ok('a host that offers no delete reports E077 instead of pretending it worked');

  await rejects('add library "Files"\ndelete the file', 'E052');
  await rejects('delete the file "x.txt"', 'E042');
  ok('a delete with no name is E052, and a delete without the Files library is E042');
}

// ------------------------------------------------------------------
// 3. repeat until — body first, then the condition.
// ------------------------------------------------------------------
console.log('\n1.5a1: repeat until');
{
  const counted = await run(
    "let 'n' be 0\n" +
    "repeat until 'n' is 3\n" +
    "  let 'n' be 'n' plus 1\n" +
    'end repeat\n' +
    "say 'n'");
  assert.deepEqual(counted.output, ['3']);
  ok('repeat until stops as soon as the condition is true');

  // The condition is already true on entry, so a while would skip the body.
  // repeat until runs it once, then stops.
  const once = await run(
    "let 'n' be 6\n" +
    'let \'rounds\' be 0\n' +
    "repeat until 'n' is 6\n" +
    "  let 'rounds' be 'rounds' plus 1\n" +
    'end repeat\n' +
    "say 'rounds'");
  assert.deepEqual(once.output, ['1'], 'the body runs before the condition is tested');
  ok('repeat until always runs its body at least once');

  await rejects('repeat until\nsay "x"\nend repeat', 'E027');
  await rejects('repeat until \'n\' is 1\nsay "x"', 'E018');
  ok('a repeat until with no condition or no ending is caught');
}

// ------------------------------------------------------------------
// 4. The comparisons, in every English form.
// ------------------------------------------------------------------
console.log('\n1.5a1: comparisons read like English');
{
  const trueForms = [
    'is 5', 'is equal to 5', 'equals 5', 'is exactly 5', 'is exactly equal to 5',
    'is not 4', 'is not equal to 4', 'is different from 4',
    'is greater than 4', 'is more than 4',
    'is less than 6',
    'is at least 5', 'is no less than 5',
    'is at most 5', 'is no more than 5',
    'is greater than or equal to 5', 'is less than or equal to 5'
  ];
  for (const form of trueForms) {
    const result = await run(
      "let 'a' be 5\n" +
      "if 'a' " + form + ' then say "YES"\n' +
      'otherwise say "NO"');
    assert.deepEqual(result.output, ['YES'], form + ' should be true for 5');
  }
  ok('all ' + trueForms.length + ' comparison forms are true for 5');

  const falseForms = [
    'is 6', 'is equal to 6', 'is exactly 4', 'is not 5', 'is different from 5',
    'is greater than 5', 'is more than 5', 'is less than 5',
    'is at least 6', 'is at most 4', 'is no more than 4', 'is no less than 6',
    'is greater than or equal to 6', 'is less than or equal to 4'
  ];
  for (const form of falseForms) {
    const result = await run(
      "let 'a' be 5\n" +
      "if 'a' " + form + ' then say "YES"\n' +
      'otherwise say "NO"');
    assert.deepEqual(result.output, ['NO'], form + ' should be false for 5');
  }
  ok('all ' + falseForms.length + ' negated forms are false for 5');

  // The same words work in a wait, because a condition is a condition.
  const waited = await run(
    "let 'a' be 5\n" +
    "wait until 'a' is at least 5\n" +
    'say "waited"');
  assert.deepEqual(waited.output, ['waited']);
  ok('the same comparison words work inside wait until');

  // Booleans print as words, in the JavaScript engine as well.
  const printed = await run(
    "let 'a' be 5\n" +
    "if 'a' is at least 5 then say true\n" +
    "if 'a' is at least 6 then say true\n" +
    'otherwise say false');
  assert.deepEqual(printed.output, ['True', 'False']);
  ok('a yes/no answer prints as True and False');
}

// ------------------------------------------------------------------
// 5. The documentation and the catalogue agree with the release.
// ------------------------------------------------------------------
console.log('\n1.5a1: the release ships as one piece');
{
  const errors = require('../js/errors.js');
  assert.equal(EPP.VERSION, '1.5a1', 'the engine reports 1.5a1');
  assert.equal(errors.Errors.total, 103);
  assert.equal(errors.Errors.name('E076'), 'Cannot Delete A Missing File');
  assert.equal(errors.Errors.name('E077'), 'Cannot Delete The File');
  assert.equal(errors.Errors.name('W006'), 'Wait Can Never End Here');
  ok('the engine version and the three new codes match the release');

  const reference = readFileSync(join(root, 'LANGUAGE.md'), 'utf8');
  assert.match(reference, /\(1\.5a1\)/, 'the reference is titled 1.5a1');
  assert.ok(reference.includes('wait until'), 'the reference documents wait until');
  assert.ok(reference.includes('delete the file'), 'the reference documents delete the file');
  assert.ok(reference.includes('repeat until'), 'the reference documents repeat until');
  ok('LANGUAGE.md documents all four new features');

  // The shipped example set stays small and every file is real.
  const examples = [
    '01_hello.enpp', '02_arithmetic.enpp', '03_variables_and_questions.enpp',
    '04_control_flow.enpp', '05_math_library.enppl', '06_files_library.enppl',
    '07_wait_until.enppl', '08_python_library.enppl', '09_strings_library.enppl',
    '10_saved_project.enpp', '11_studio_showcase.enppl'
  ];
  for (const name of examples) {
    const text = readFileSync(join(root, 'examples', name), 'utf8');
    assert.ok(text.length > 0, name + ' is not empty');
  }
  ok('the eleven curated examples all exist');
}

console.log('\nAll ' + passed + ' E++ 1.5a1 checks passed.');
