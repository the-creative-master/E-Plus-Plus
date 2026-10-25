/**
 * Headless test-suite for the E++ language core (Dev Build 4).
 * Loads the browser scripts into a VM context, then exercises
 * lexer -> parser -> AST -> interpreter, the library system, the .eppl/.eppla
 * file store, Python runner, and the E++.zip standalone package.
 *
 * Run: npm test   (or: node tests/run-tests.mjs)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({
  console, setTimeout, clearTimeout, Promise, Math, JSON, Date,
  Map, Set, Error, Number, String, Array, Object, RegExp, Uint8Array, Uint32Array,
  DataView, TextEncoder, TextDecoder, Blob: undefined, Symbol,
  // Release 1.2: the vault needs a secure random source for its keys.
  crypto: globalThis.crypto
});
context.window = context;
context.globalThis = context;

for (const file of [
  'errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'keyboard.js', 'parser.js',
  'python-runner.js', 'interpreter.js', 'files.js', 'highlight.js', 'standalone-generator.js',
  'vault.js', 'ideas.js', 'a11y.js', 'tutorials.js'
]) {
  vm.runInContext(readFileSync(join(root, 'js', file), 'utf8'), context, { filename: file });
}
const EPP = context.EPP;
assert.ok(EPP && EPP.Lexer && EPP.Parser && EPP.Interpreter, 'E++ core loaded');

let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }

async function run(source, options = {}) {
  const output = [];
  const answers = [...(options.answers || [])];
  const events = [];
  const interpreter = await EPP.run(source, {
    output: (t) => output.push(t),
    input: async () => answers.shift() ?? '',
    delay: async () => {},
    frame: async () => {},
    pythonExecutor: options.pythonExecutor,
    keys: options.keys || {},
    maxFrames: options.maxFrames || 20,
    onGame: (event) => events.push(event),
  });
  return { output, interpreter, events };
}

async function expectError(name, source, pattern, options) {
  try {
    await run(source, options);
  } catch (e) {
    assert.match(e.format ? e.format() : e.message, pattern, name);
    ok(name + '  ->  ' + (e.format ? e.format().split('\n')[0] : e.message));
    return;
  }
  assert.fail(name + ': expected an error but the program ran');
}

console.log('Lexer');
{
  const tokens = EPP.Lexer.tokenize('Define name as WeeklyHow.\nsay \'name\'');
  const types = tokens.map((t) => t.type);
  assert.ok(types.includes('STRING') === false);
  assert.ok(types.includes('VARIABLE'));
  assert.ok(types.includes('PERIOD'));
  assert.ok(types.includes('NEWLINE'));
  ok('tokenizes strings, variables, periods and newlines');
  assert.throws(() => EPP.Lexer.tokenize('say "unterminated'), /never ends/);
  ok('unterminated string is a LexError');
}

console.log('Parser / AST');
{
  const ast = EPP.Parser.parse('Define x as 1 plus 2.');
  assert.equal(ast.type, 'Program');
  assert.equal(ast.body[0].type, 'Define');
  assert.equal(ast.body[0].value.type, 'Binary');
  ok('builds AST nodes for Define + maths');
}

console.log('Interpreter: basics from the spec');
{
  const { output } = await run('Define name as WeeklyHow.\nsay "Hello " plus \'name\' plus "!"');
  assert.deepEqual([...output], ['Hello WeeklyHow!']);
  ok('Define, bare-word values and say with plus concatenation');
}
{
  const { output } = await run('say 1 plus 1\nsay "1 plus 1"');
  assert.deepEqual([...output], ['2', '1 plus 1']);
  ok('bare maths evaluates, quoted text stays literal');
}
{
  const { output } = await run('ask "What is your name?" and save answer as name\nsay "Hi " plus \'name\'', { answers: ['Sam'] });
  assert.deepEqual([...output], ['Hi Sam']);
  ok('ask ... and save answer as ...');
}
{
  const right = await run('ask "5 plus 6?" and save answer as output\nif \'output\' is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['11'] });
  const wrong = await run('ask "5 plus 6?" and save answer as output\nif \'output\' is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['9'] });
  assert.deepEqual([...right.output], ['Correct!']);
  assert.deepEqual([...wrong.output], ['Wrong!']);
  ok('if ... is equal to ... then ... otherwise ... (typed numbers compare as numbers)');
}
{
  const { output } = await run('Define count as 3.\nrepeat 3 times\n  say \'count\'\n  Set count to \'count\' minus 1.\nend repeat\nsay "Blast off!"');
  assert.deepEqual([...output], ['3', '2', '1', 'Blast off!']);
  ok('repeat/end repeat, Set, block if support');
}
{
  const { output } = await run('Define n as 0.\nwhile \'n\' is less than 3 do\n  Set n to \'n\' plus 1.\nend while\nsay \'n\'');
  assert.deepEqual([...output], ['3']);
  ok('while loops with is less than');
}
{
  const { output } = await run('if 2 is greater than 1 then\n  say "big"\notherwise say "small"\nend if');
  assert.deepEqual([...output], ['big']);
  ok('block if with an inline otherwise still closes with end if');
}

console.log('Interpreter: maths precedence & strings');
{
  const { output } = await run('say 2 plus 3 times 4\nsay (2 plus 3) times 4\nsay 10 minus 4 minus 3');
  assert.deepEqual([...output], ['14', '20', '3']);
  ok('precedence: times before plus, parentheses, left associativity');
}

console.log('Bare words must mean something');
await expectError('say hello is an error, not literal text', 'say hello', /The word "hello" does not mean anything in E\+\+ yet/);
await expectError('say hello world is an error too', 'say hello world', /do not mean anything in E\+\+ yet/);
await expectError('using an undefined bare word in maths is an error', 'say 1 plus banana', /"banana" does not mean anything/);
{
  const { output } = await run('Define name as WeeklyHow.\nsay \'name\'\nDefine greeting as Hello there.\nsay \'greeting\'');
  assert.deepEqual([...output], ['WeeklyHow', 'Hello there']);
  ok('Define <name> as <bare words> still stores the literal words (spec example)');
}
await expectError('Dev Build 4: a bare variable name is an error (must be single-quoted)', 'Define count as 3.\nif count is equal to 3 then say "three" otherwise say "other"', /variables must be written inside single quotes/);
{
  const { output } = await run('Define count as 3.\nif \'count\' is equal to 3 then say "three" otherwise say "other"');
  assert.deepEqual([...output], ['three']);
  ok("Dev Build 4: the same condition with 'count' in single quotes works");
}
{
  assert.throws(() => EPP.Lexer.tokenize('python code ",print(1)\nprint(2)\n,"'), /never ends/);
  ok('the lexer has no Python knowledge (blocks are handled before lexing)');
}

console.log('Python-looking code is not E++');
await expectError('print("HELLO") does not print anything', 'print("HELLO")', /is Python, not E\+\+, so E\+\+ will not run it/);
await expectError('PRINT("HELLO") does not print anything either', 'PRINT("HELLO")', /is Python, not E\+\+/);
await expectError('bare print is refused even WITH the Python library', 'add library "Python"\nprint("HELLO")', /is Python, not E\+\+/);
await expectError('print with a bare word is refused too', 'print hello', /is Python, not E\+\+/);
{
  const seen = [];
  await run(
    'add library "Python"\npython code "print(\'HELLO\')"',
    { pythonExecutor: async (code) => { seen.push(code); } }
  );
  assert.deepEqual(seen, ["print('HELLO')"]);
  ok('python code "..." with add library "Python" reaches the runner');
}

console.log('Dev Build 4: quoted variables, loopback, Draw sprites');
await expectError('loopback with no if before it is an English error', 'loopback to if', /no if for this loopback/);
await expectError('loopback without "to if" is an English ParseError', 'loopback if', /Expected "to" after "loopback"/);
{
  const { output } = await run(
    "Define count as 0\n" +
    "ask \"Number?\" and save answer as n\n" +
    "if 'n' is equal to 1 then Increase count by 1 and\n" +
    "otherwise say \"not one\"\n" +
    "loopback to if\n" +
    "say 'count'", { answers: ['1'] });
  assert.deepEqual([...output], ['2']);
  ok('loopback to if re-runs the if when its condition is true');
}
{
  const { output } = await run(
    "ask \"Number?\" and save answer as n\n" +
    "if 'n' is equal to 1 then say \"one\" otherwise say \"other\"\n" +
    "loopback to if\n" +
    "say \"after\"");
  assert.deepEqual([...output], ['other', 'after']);
  ok('loopback to if is ignored when the condition is false');
}
{
  const { output } = await run(
    "Define flag as 1\n" +
    "if 'flag' is equal to 1 then say \"first\" otherwise say \"never\"\n" +
    "Set flag to 2\n" +
    "loopback to if\n" +
    "say \"done\"");
  assert.deepEqual([...output], ['first', 'done']);
  ok('loopback re-evaluates the condition (changed value means no trigger)');
}
{
  const events = [];
  const result = await (async () => {
    const interp = new EPP.Interpreter({ output: () => {}, input: async () => '', delay: async () => {}, onSprite: (e) => events.push(e) });
    return interp.run(EPP.Parser.parse(
      "define 'hero' as drawing sprite\n" +
      "'hero' move right \"30\"\n" +
      "'hero' move up \"10\"\n" +
      "'hero' move left \"5\"\n" +
      "'hero' move down \"2\""));
  })();
  const hero = result.sprites.get('hero');
  assert.deepEqual([hero.x, hero.y], [25, -8]);
  assert.equal(events.length, 5);
  assert.equal(events[0].action, 'create');
  ok('Draw: define \'<name>\' as drawing sprite + movements track x/y');
}
await expectError('Draw: pixels must be a quoted string', "define 'hero' as drawing sprite\n'hero' move up 10", /pixels must be written as text in double quotes/);
await expectError('Draw: pixels must be a number inside the quotes', "define 'hero' as drawing sprite\n'hero' move up \"ten\"", /not a number/);
await expectError('Draw: moving an undefined sprite explains how to create it', "'ghost' move up \"10\"", /no sprite called 'ghost'/);

console.log('Increase / Decrease');
{
  const { output } = await run(
    'Define score as 10.\n' +
    'Increase score by 5\n' +
    'say \'score\'\n' +
    'Decrease score by 3\n' +
    'say \'score\'\n' +
    'Increase \'score\' by "4"\n' +
    'say \'score\'\n' +
    'Decrease score by 2 plus 1\n' +
    'say \'score\''
  );
  assert.deepEqual([...output], ['15', '12', '16', '13']);
  ok('Increase/Decrease works on bare, quoted and expression amounts');
}
await expectError('increasing an undefined variable explains how to define it', 'Increase missing by 1', /Cannot increase 'missing'/);
await expectError('decreasing text explains it is not a number', 'Define name as WeeklyHow.\nDecrease name by 1', /not a number/);
await expectError('increasing by text explains the amount must be a number', 'Define score as 1.\nIncrease score by "Bob"', /amount is not a number/);
await expectError('Increase without "by" is an English ParseError', 'Define score as 1.\nIncrease score 1', /needs the word "by"/);

console.log('Asking again, branches, comparisons, not-a-number');
{
  const { output } = await run(
    'ask "What is 5 plus 6?" and save answer as output\n' +
    'if \'output\' is equal to 11 then say "Correct!" otherwise ask "What is 5 plus 6?" and save answer as output\n' +
    'say \'output\'',
    { answers: ['9', '11'] }
  );
  assert.deepEqual([...output], ['11']);
  ok('otherwise ask "..." asks again and saves the new answer');
}

console.log('Python library & Project Humanizer (Requirements 1, 3, 9)');
await expectError('python code without the Python library is a clear English LibraryError',
  'python code "print(1)"', /You cannot run Python code yet, because the Python library has not been added/);
{
  const seen = [];
  const { output } = await run('add library "Python"\npython code "print(\'Hello from Python\')"', {
    pythonExecutor: async (code) => { seen.push(code); }
  });
  assert.deepEqual(seen, ["print('Hello from Python')"]);
  assert.deepEqual([...output], []);
  ok('add library "Python" unlocks single-line python code "..."');
}
{
  // Project Humanizer comma-mode: python code ", ... ,"
  const seen = [];
  await run(
    'add library "Python"\n' +
    'python code ",total = 1 + 2\n' +
    'for i in range(3):\n' +
    '    print(i)\n' +
    ',"\n' +
    'say "done"',
    { pythonExecutor: async (code) => { seen.push(code); } }
  );
  assert.equal(seen.length, 1);
  assert.ok(seen[0].includes('total = 1 + 2'));
  assert.ok(seen[0].includes('for i in range(3):\n    print(i)\n'));
  ok('Humanizer comma mode: passes multi-line Python block raw with no E++ parsing');
}
{
  // Built-in lexer-based Python runner execution (No Pyodide!)
  const { output } = await run(
    'add library "Python"\n' +
    'python code "print(\'Executing directly in pure JS!\')"\n' +
    'python code ",for n in range(3):\n    print(\'Number:\', n)\n,"\n' +
    'say "All done"'
  );
  assert.deepEqual([...output], [
    'Executing directly in pure JS!',
    'Number: 0',
    'Number: 1',
    'Number: 2',
    'All done'
  ]);
  ok('Lexer-based Python runner runs real Python code in pure JS without Pyodide');
}
{
  // Requirement 3: Python\'s OWN error codes are reported directly
  let caught = null;
  try {
    await run('add library "Python"\npython code "print(missing)"');
  } catch (e) { caught = e; }
  assert.ok(caught, 'expected a Python error');
  assert.match(caught.format(), /NameError: name 'missing' is not defined/);
  ok('Python failures use Python\'s own exact error codes (Requirement 3)');
}
{
  let divZero = null;
  try {
    await run('add library "Python"\npython code "x = 10 / 0"');
  } catch (e) { divZero = e; }
  assert.ok(divZero, 'expected ZeroDivisionError');
  assert.match(divZero.format(), /ZeroDivisionError: division by zero/);
  ok('Python division by zero reports ZeroDivisionError: division by zero');
}

console.log('Libraries & Humanizer syntax');
{
  const { output, interpreter } = await run(
    'add library "Math"\n' +
    'display 1 divided by 2 as fraction\n' +
    'display 1 divided by 2 as decimal\n' +
    'display 1 divided by 3 as fraction\n' +
    'say 50 percent of 200\n' +
    'say square root of 16\n' +
    'say 2 power of 3'
  );
  assert.deepEqual([...output], ['1/2', '0.5', '1/3', '100', '4', '8']);
  assert.ok(interpreter.loadedLibraries.has('Math'));
  ok('add library "Math": unlocked all math features');
}
{
  const { output } = await run('add library "Text"\nsay uppercase of "hello"\nsay length of "hello"');
  assert.deepEqual([...output], ['HELLO', '5']);
  ok('add library "Text" unlocks its functions');
}

console.log('.eppl vs .eppla file system (Requirement 5)');
{
  const store = new EPP.EpplFileStore(new EPP.MemoryStorage());
  assert.equal(EPP.isEpplFile('a.eppl'), true);
  assert.equal(EPP.isEpplFile('a.eppla'), true);
  assert.equal(EPP.isEpplaFile('a.eppla'), true);
  assert.equal(EPP.isEpplaFile('a.eppl'), false);
  assert.equal(EPP.validateEpplFileName('quiz'), 'quiz.eppl');
  assert.equal(EPP.validateEpplFileName('math', 'add library "Math"'), 'math.eppla');
  assert.throws(() => EPP.validateEpplFileName('bad.exe'), /invalid extension/);

  store.createFile('prog.eppl', 'say "hello"');
  assert.equal(store.getFile('prog.eppl').content, 'say "hello"');

  store.createFile('libprog.eppla', 'add library "Math"');
  assert.equal(store.getFile('libprog.eppla').content, 'add library "Math"');

  store.deleteFile('prog.eppl');
  assert.equal(store.exists('prog.eppl'), false);
  ok('.eppl and .eppla files validated, created, saved, deleted');
}

console.log('E++.zip Standalone Runtime (Requirement 6 & 7)');
{
  const standaloneHtml = EPP.generateStandaloneHtml();
  assert.ok(standaloneHtml.includes('E++ Standalone Runtime'));
  assert.ok(standaloneHtml.includes('save project as name.eppl'));
  assert.ok(standaloneHtml.includes('Libraries are not supported in the standalone E++.zip runtime'));
  const zip = EPP.buildZip([{ name: 'index.html', content: standaloneHtml }]);
  assert.ok(zip instanceof Uint8Array && zip.length > 500);
  ok('E++.zip packages the entire standalone E++ runtime into a clean zip');
}

console.log('Syntax highlighting');
{
  const html = EPP.highlight('add library "Math"\nsay "Hello" plus \'name\'');
  assert.match(html, /tok-keyword/);
  assert.match(html, /tok-string/);
  assert.match(html, /tok-variable/);
  assert.match(html, /tok-operator/);
  ok('lexer-driven highlighting emits token classes');
}

// ============================================================
// Dev Build 5 Tests
// ============================================================

console.log('Dev Build 5: Core Logic — contains (no library needed)');
{
  const { output } = await run(
    'Define greeting as "Hello World"\n' +
    'if \'greeting\' contains "Hello" then say "yes1" otherwise say "no1"\n' +
    'if \'greeting\' contains "World" then say "yes2" otherwise say "no2"\n' +
    'if \'greeting\' contains "xyz" then say "yes3" otherwise say "no3"'
  );
  assert.deepEqual([...output], ['yes1', 'yes2', 'no3']);
  ok('contains works for string substring matching');
}
{
  const { output } = await run(
    'Define x as 42\n' +
    'if \'x\' contains "4" then say "found" otherwise say "not found"'
  );
  assert.deepEqual([...output], ['found']);
  ok('contains works on numeric values (converts to string)');
}
{
  const { output } = await run(
    'ask "Enter text:" and save answer as msg\n' +
    'if \'msg\' contains "hello" then say "greeted" otherwise say "silent"',
    { answers: ['say hello please'] }
  );
  assert.deepEqual([...output], ['greeted']);
  ok('contains works with ask answers');
}
{
  const { output } = await run(
    'repeat 3 times\n' +
    '  Define word as "abcdef"\n' +
    '  if \'word\' contains "cd" then say "inner-yes" otherwise say "inner-no"\n' +
    'end repeat'
  );
  assert.deepEqual([...output], ['inner-yes', 'inner-yes', 'inner-yes']);
  ok('contains works inside loops');
}
{
  const { output } = await run(
    'Define text as "Hello"\n' +
    'Set \'text\' to "Goodbye"\n' +
    'if \'text\' contains "bye" then say "changed" otherwise say "same"'
  );
  assert.deepEqual([...output], ['changed']);
  ok('contains works with Set using quoted variable names');
}

console.log('Dev Build 5: Math Logic — positive/negative (requires Math library)');
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as 5\n' +
    'if \'x\' is a positive number then say "pos" otherwise say "not-pos"\n' +
    'Define y as 0 minus 3\n' +
    'if \'y\' is a negative number then say "neg" otherwise say "not-neg"\n' +
    'Define z as 0\n' +
    'if \'z\' is a positive number then say "zero-pos" otherwise say "zero-not-pos"\n' +
    'if \'z\' is a negative number then say "zero-neg" otherwise say "zero-not-neg"'
  );
  assert.deepEqual([...output], ['pos', 'neg', 'zero-not-pos', 'zero-not-neg']);
  ok('is a positive/negative number (zero is neither)');
}
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as 0 minus 5\n' +
    'if \'x\' is not a positive number then say "correct" otherwise say "wrong"\n' +
    'Define y as 3\n' +
    'if \'y\' is not a negative number then say "correct" otherwise say "wrong"'
  );
  assert.deepEqual([...output], ['correct', 'correct']);
  ok('is not a positive/negative number (negation works)');
}
await expectError('positive number check requires Math library',
  'Define x as 5\nif \'x\' is a positive number then say "yes"',
  /belongs to the Math library/);
await expectError('negative number check requires Math library',
  'Define x as 0 minus 1\nif \'x\' is a negative number then say "yes"',
  /belongs to the Math library/);
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as "hello"\n' +
    'if \'x\' is a positive number then say "pos" otherwise say "not-pos"\n' +
    'if \'x\' is not a positive number then say "correct" otherwise say "wrong"'
  );
  assert.deepEqual([...output], ['not-pos', 'correct']);
  ok('non-numeric values are "not a positive number" and "not a negative number"');
}

console.log('Dev Build 5: Math Logic — range (requires Math library)');
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as 5\n' +
    'if \'x\' is in the range of 1 to 10 then say "in" otherwise say "out"\n' +
    'Define y as 15\n' +
    'if \'y\' is in the range of 1 to 10 then say "in" otherwise say "out"\n' +
    'Define z as 1\n' +
    'if \'z\' is in the range of 1 to 10 then say "boundary-low" otherwise say "out"\n' +
    'Define w as 10\n' +
    'if \'w\' is in the range of 1 to 10 then say "boundary-high" otherwise say "out"'
  );
  assert.deepEqual([...output], ['in', 'out', 'boundary-low', 'boundary-high']);
  ok('is in the range of A to B (inclusive boundaries)');
}
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as 5\n' +
    'if \'x\' is not in the range of 10 to 20 then say "correct" otherwise say "wrong"\n' +
    'Define y as 15\n' +
    'if \'y\' is not in the range of 10 to 20 then say "wrong" otherwise say "correct"'
  );
  assert.deepEqual([...output], ['correct', 'correct']);
  ok('is not in the range of A to B (negation works)');
}
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define x as 5\n' +
    'if \'x\' is in the range of 10 to 1 then say "reversed-yes" otherwise say "reversed-no"'
  );
  assert.deepEqual([...output], ['reversed-yes']);
  ok('range handles reversed bounds (10 to 1 means 1 to 10)');
}
await expectError('range check requires Math library',
  'Define x as 5\nif \'x\' is in the range of 1 to 10 then say "yes"',
  /belongs to the Math library/);
{
  const { output } = await run(
    'add library "Math"\n' +
    'repeat 5 times\n' +
    '  Define n as 3\n' +
    '  if \'n\' is in the range of 1 to 10 then say "loop-ok" otherwise say "loop-fail"\n' +
    'end repeat'
  );
  assert.deepEqual([...output], ['loop-ok', 'loop-ok', 'loop-ok', 'loop-ok', 'loop-ok']);
  ok('range check works inside loops');
}

console.log('Dev Build 5: Variable System — any word in quotes is valid');
{
  const { output } = await run(
    'Define \'my var\' as "hello"\n' +
    'say \'my var\''
  );
  assert.deepEqual([...output], ['hello']);
  ok('multi-word variable names work inside quotes');
}
{
  const { output } = await run(
    'Define \'123\' as "numbers"\n' +
    'say \'123\''
  );
  assert.deepEqual([...output], ['numbers']);
  ok('numeric variable names work inside quotes');
}
{
  const { output } = await run(
    'Define \'special name!!\' as 42\n' +
    'say \'special name!!\''
  );
  assert.deepEqual([...output], ['42']);
  ok('special character variable names work inside quotes');
}

console.log('Dev Build 5: Set with quoted variable names');
{
  const { output } = await run(
    'Define count as 0\n' +
    'Set \'count\' to 10\n' +
    'say \'count\''
  );
  assert.deepEqual([...output], ['10']);
  ok('Set \'variable\' to value works with quoted variable name');
}
{
  const { output } = await run(
    'Define count as 0\n' +
    'repeat 3 times\n' +
    '  Set \'count\' to \'count\' plus 1\n' +
    'end repeat\n' +
    'say \'count\''
  );
  assert.deepEqual([...output], ['3']);
  ok('Set with quoted variable works inside loops');
}

console.log('Dev Build 5: Ask with quoted variable names');
{
  const { output } = await run(
    'ask "Name?" and save answer as \'my name\'\n' +
    'say "Hi " plus \'my name\'',
    { answers: ['Alice'] }
  );
  assert.deepEqual([...output], ['Hi Alice']);
  ok('ask saves to quoted variable name');
}
{
  const { output } = await run(
    'ask "Score?" and save answer as \'player score\'\n' +
    'if \'player score\' is equal to 100 then say "perfect" otherwise say "keep going"',
    { answers: ['100'] }
  );
  assert.deepEqual([...output], ['perfect']);
  ok('ask with quoted variable works with conditions');
}

console.log('Dev Build 5: Image Library (Base64)');
await expectError('display image without Image library is an error',
  'display image \'cat\'',
  /belongs to the Image library|Image library has not been added/);
await expectError('define image without Image library is an error',
  "define 'cat' as image \"iVBOR\"",
  /belongs to the Image library|Image library has not been added/);
await expectError('check if without Image library is an error',
  "check if 'cat' exists",
  /belongs to the Image library|Image library has not been added/);
{
  const displays = [];
  const result = await (async () => {
    const interp = new EPP.Interpreter({
      output: () => {},
      input: async () => '',
      delay: async () => {},
      onImageDisplay: (info) => displays.push(info)
    });
    return interp.run(EPP.Parser.parse(
      'add library "Image"\n' +
      "define 'cat' as image \"iVBORw0KGgo=\"\n" +
      'display image \'cat\'', { fileName: 'test.eppla' }));
  })();
  assert.equal(displays.length, 1);
  assert.equal(displays[0].name, 'cat');
  assert.equal(displays[0].source, 'iVBORw0KGgo=');
  assert.ok(result.images.has('cat'));
  ok('Image library: define with Base64, display image works');
}
{
  const { output } = await run(
    'add library "Image"\n' +
    "define 'cat' as image \"iVBORw0KGgo=\"\n" +
    "check if 'cat' exists"
  );
  assert.deepEqual([...output], ['cat exists']);
  ok('check if image variable exists (defined)');
}
{
  const { output } = await run(
    'add library "Image"\n' +
    "check if 'ghost' exists"
  );
  assert.deepEqual([...output], ['ghost does not exist']);
  ok('check if image variable exists (not defined)');
}
await expectError('displaying an undefined image explains how to create it',
  "add library \"Image\"\ndisplay image 'ghost'",
  /no image called 'ghost'/);
{
  const displays = [];
  await (async () => {
    const interp = new EPP.Interpreter({
      output: () => {},
      input: async () => '',
      delay: async () => {},
      onImageDisplay: (info) => displays.push(info)
    });
    return interp.run(EPP.Parser.parse(
      'add library "Image"\n' +
      "define 'photo' as image \"data:image/png;base64,iVBORw0KGgo=\"\n" +
      "display image 'photo'", { fileName: 'test.eppla' }));
  })();
  assert.equal(displays.length, 1);
  assert.equal(displays[0].source, 'data:image/png;base64,iVBORw0KGgo=');
  ok('Image library: full data-URI strings are accepted');
}
{
  const displays = [];
  await (async () => {
    const interp = new EPP.Interpreter({
      output: () => {},
      input: async () => '',
      delay: async () => {},
      onImageDisplay: (info) => displays.push(info)
    });
    return interp.run(EPP.Parser.parse(
      'add library "Image"\n' +
      "define 'a' as image \"abc123\"\n" +
      "define 'b' as image \"def456\"\n" +
      "display image 'a'\n" +
      "display image 'b'", { fileName: 'test.eppla' }));
  })();
  assert.equal(displays.length, 2);
  assert.equal(displays[0].name, 'a');
  assert.equal(displays[1].name, 'b');
  ok('Image library: multiple images can be defined and displayed');
}

console.log('Dev Build 5: Combined features');
{
  const { output } = await run(
    'add library "Math"\n' +
    'ask "Enter a number:" and save answer as \'user input\'\n' +
    'if \'user input\' is a positive number then\n' +
    '  if \'user input\' is in the range of 1 to 100 then\n' +
    '    say "Valid positive in range"\n' +
    '  otherwise\n' +
    '    say "Positive but out of range"\n' +
    '  end if\n' +
    'otherwise\n' +
    '  say "Not a positive number"\n' +
    'end if',
    { answers: ['50'] }
  );
  assert.deepEqual([...output], ['Valid positive in range']);
  ok('combined: positive number + range check with ask + quoted variables');
}
{
  const { output } = await run(
    'add library "Math"\n' +
    'Define score as 0\n' +
    'repeat 5 times\n' +
    '  Set \'score\' to \'score\' plus 3\n' +
    '  if \'score\' is a positive number then say "pos:" plus \'score\' otherwise say "not pos"\n' +
    'end repeat'
  );
  assert.deepEqual([...output], ['pos:3', 'pos:6', 'pos:9', 'pos:12', 'pos:15']);
  ok('combined: Set with quotes + positive check inside repeat loop');
}
{
  const { output } = await run(
    'Define sentence as "The quick brown fox"\n' +
    'repeat 3 times\n' +
    '  if \'sentence\' contains "fox" then say "found fox" otherwise say "no fox"\n' +
    'end repeat'
  );
  assert.deepEqual([...output], ['found fox', 'found fox', 'found fox']);
  ok('combined: contains inside repeat loop');
}

// ===== Dev Build 6 Tests =====
console.log('\n--- Dev Build 6: Exact Equality ---');
{
  const { output } = await run(
    'Define \'name\' as "Hello"\n' +
    'if \'name\' is exactly equal to "Hello" then say "match" otherwise say "no match"'
  );
  assert.deepEqual([...output], ['match']);
  ok('is exactly equal to: exact case matches');
}
{
  const { output } = await run(
    'Define \'name\' as "Hello"\n' +
    'if \'name\' is exactly equal to "hello" then say "match" otherwise say "no match"'
  );
  assert.deepEqual([...output], ['no match']);
  ok('is exactly equal to: different case does not match');
}
{
  const { output } = await run(
    'Define \'name\' as "Hello"\n' +
    'if \'name\' is equal to "hello" then say "match" otherwise say "no match"'
  );
  assert.deepEqual([...output], ['match']);
  ok('is equal to: case-insensitive match still works');
}
{
  const { output } = await run(
    'Define \'name\' as "Hello"\n' +
    'if \'name\' is not exactly equal to "World" then say "different" otherwise say "same"'
  );
  assert.deepEqual([...output], ['different']);
  ok('is not exactly equal to: works correctly');
}
{
  const { output } = await run(
    'Define \'name\' as "Hello"\n' +
    'if \'name\' is not exactly equal to "hello" then say "different" otherwise say "same"'
  );
  assert.deepEqual([...output], ['different']);
  ok('is not exactly equal to: case-sensitive difference detected');
}

// ============================================================
// Release 1.2 — project files (keys, keyring, cross-engine format)
// ============================================================
console.log('\nRelease 1.2: project files');

const VAULT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);

{
  const hex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(hex(EPP.Vault.sha256(EPP.Vault.utf8Encode('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hex(EPP.Vault.hmacSha256(EPP.Vault.utf8Encode('key'), EPP.Vault.utf8Encode('The quick brown fox jumps over the lazy dog'))),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  ok('SHA-256 and HMAC-SHA256 match the published test vectors');
}

{
  // RFC 8439 section 2.3.2 — the reference ChaCha20 block.
  const nonce = Uint8Array.from([0, 0, 0, 9, 0, 0, 0, 0x4a, 0, 0, 0, 0]);
  const block = EPP.Vault.chacha20Block(VAULT_KEY, nonce, 1);
  const hex = Array.from(block).map(b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(hex, '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4ed2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e');
  ok('ChaCha20 matches the RFC 8439 block test vector');
}

{
  const plaintext = 'say "Hello, World!"\nnote [unicode ✓ 漢字]\nsay 1 plus 1\n';
  const sealed = EPP.Vault.saveText(plaintext, VAULT_KEY);
  assert.ok(EPP.Vault.looksLikeVault(sealed));
  assert.equal(EPP.Vault.loadText(sealed, VAULT_KEY), plaintext);
  assert.ok(!sealed.includes('Hello'), 'ciphertext must not contain the source');
  assert.ok(!/encrypt|key|vault/i.test(sealed), 'the file must not announce anything about itself');
  ok('a sealed project opens with its key and leaks nothing readable');
}

{
  const sealed = EPP.Vault.saveText('say "secret"', VAULT_KEY);
  const otherKey = EPP.Vault.generateKey();
  assert.throws(() => EPP.Vault.loadText(sealed, otherKey), (e) => e.code === 'E520');
  const tampered = EPP.Vault.base64Decode(sealed);
  tampered[30] ^= 0x01;
  assert.throws(() => EPP.Vault.loadText(EPP.Vault.base64Encode(tampered), VAULT_KEY), (e) => e.code === 'E520');
  assert.throws(() => EPP.Vault.loadText('say "plain text"', VAULT_KEY), (e) => e.code === 'E511');
  ok('wrong keys and edited files are rejected (E520), plaintext is not a vault (E511)');
}

{
  const sealedA = EPP.Vault.saveText('say "first"', VAULT_KEY);
  const second = EPP.Vault.generateKey();
  const sealedB = EPP.Vault.saveText('say "second"', second);
  const ring = new EPP.Vault.Keyring(new EPP.Vault.MemoryKeyStore());
  const made = await ring.createKeyFor('game.eppl');
  assert.equal(typeof made.key, 'string');
  await ring.importJson({ keys: [{ id: 'a', project: 'game.eppl', key: EPP.Vault.base64Encode(VAULT_KEY), createdAt: '2026-01-01T00:00:00Z' }] });
  await ring.importJson({ keys: [{ id: 'b', project: 'game.eppl', key: EPP.Vault.base64Encode(second), createdAt: '2026-01-02T00:00:00Z' }] });
  const openA = await ring.openVault(sealedA, 'game.eppl');
  const openB = await ring.openVault(sealedB, 'game.eppl');
  assert.equal(openA.text, 'say "first"');
  assert.equal(openB.text, 'say "second"');
  assert.ok(openA.tried <= 3 && openB.tried <= 3, 'tried ' + openA.tried + '/' + openB.tried);
  ok('the keyring tries every saved key until a project opens');
}

{
  const ring = new EPP.Vault.Keyring(new EPP.Vault.MemoryKeyStore());
  const made = await ring.createKeyFor('demo.enppl');
  assert.equal(made.record.project, 'demo.enppl');
  assert.equal(made.record.fingerprint, EPP.Vault.fingerprint(made.key));
  const exported = await ring.exportJson();
  const other = new EPP.Vault.Keyring(new EPP.Vault.MemoryKeyStore());
  const added = await other.importJson(exported);
  assert.equal(added, 1);
  assert.equal(await other.keyCount(), 1);
  const missing = await new EPP.Vault.Keyring(new EPP.Vault.MemoryKeyStore()).openVault(
    EPP.Vault.saveText('say "x"', VAULT_KEY), 'x.enppl');
  assert.equal(missing.ok, false);
  ok('keys can be exported, imported and counted per browser');
}

// ============================================================
// Release 1.2 — Game library
// ============================================================
console.log('\nRelease 1.2: Game library');

{
  const { output, interpreter, events } = await run(
    'add the "Game" library\n' +
    'set the game window to 640 by 480\n' +
    'set the game background to "night"\n' +
    'create the actor \'hero\' with the image "hero.png"\n' +
    'put the actor \'hero\' at 100 and 120\n' +
    '\'hero\' move right "10"\n' +
    'show the actor \'hero\'\n' +
    'say \'hero\'\n'
  );
  assert.deepEqual([...output], ['hero']);
  const hero = interpreter.actors.get('hero');
  assert.equal(hero.x, 110);
  assert.equal(hero.y, 120);
  assert.equal(interpreter.game.width, 640);
  assert.equal(interpreter.game.background, 'night');
  assert.ok(events.some(e => e.action === 'create' && e.actor.name === 'hero'));
  ok('actors are created with an image, placed, moved and named like a variable');
}

{
  const { output } = await run(
    'add the "Game" library\n' +
    'create the actor \'hero\' with the image "a.png"\n' +
    'put the actor \'hero\' at 10 and 10\n' +
    'create the actor \'gem\' with the image "b.png"\n' +
    'put the actor \'gem\' at 40 and 10\n' +
    'if \'hero\' is touching \'gem\' then say "touching" otherwise say "apart"\n' +
    'put the actor \'gem\' at 400 and 400\n' +
    'if \'hero\' is touching \'gem\' then say "touching" otherwise say "apart"\n' +
    'if \'hero\' is touching \'ghost\' then say "yes" otherwise say "no ghost"\n'
  );
  assert.deepEqual([...output], ['touching', 'apart', 'no ghost']);
  ok('is touching compares two actors and simply ignores unknown names');
}

{
  const { output, interpreter } = await run(
    'add the "Game" library\n' +
    'create the actor \'hero\' with the image "a.png"\n' +
    'put the actor \'hero\' at 0 and 0\n' +
    'play the game\n' +
    '  \'hero\' move right "5"\n' +
    '  if \'hero\' is touching \'hero\' then stop the game\n' +
    'end the game\n' +
    'say "loop finished"\n'
  );
  assert.deepEqual([...output], ['loop finished']);
  assert.equal(interpreter.game.frames, 1);
  assert.equal(interpreter.actors.get('hero').x, 5);
  ok('play the game runs frame by frame and stop the game ends it');
}

{
  EPP.Libraries.hideForDistribution(['Game', 'ImprovedWait']);
  await expectError('the Game library is not in a distribution build',
    'add the "Game" library\ncreate the actor \'a\' with the image "x"\n',
    /not included in this build/);
  await expectError('ImprovedWait is left out of E++.zip and says so',
    'add the "ImprovedWait" library', /not included in this build/);
  EPP.Libraries.showAll();
  assert.ok(EPP.Libraries.isAvailable('Game'));
}

// ============================================================
// Release 1.2 — Keyboard library
// ============================================================
console.log('\nRelease 1.2: Keyboard library');

{
  assert.equal(EPP.Keys.normalize('Up arrow'), 'ArrowUp');
  assert.equal(EPP.Keys.normalize('arrow up'), 'ArrowUp');
  assert.equal(EPP.Keys.normalize('SPACE'), ' ');
  assert.equal(EPP.Keys.normalize('a'), 'a');
  const tracker = new EPP.Keys.Tracker();
  tracker.down.ArrowUp = true;
  assert.equal(tracker.isDown('up arrow'), true);
  assert.equal(tracker.isDown('down arrow'), false);
  assert.equal(tracker.anyDown(), true);
  ok('key names normalise and the tracker knows what is held down');
}

{
  const { output } = await run(
    'add the "Keyboard" library\n' +
    'if the "Up arrow" key is pressed then say "up"\n' +
    'if the "space" key is pressed then say "jump"\n' +
    'if the "down arrow" key is not pressed then say "not down"\n' +
    'if the "p" key is pressed then say "p"\n',
    { keys: { ArrowUp: true, ' ': true, p: true } }
  );
  assert.deepEqual([...output], ['up', 'jump', 'not down', 'p']);
  ok('the "Up arrow" key is pressed works for arrows, space and letters');
}

{
  // Quotes around the key name are optional: the sentence reads the same.
  const { output } = await run(
    'add the "Keyboard" library\n' +
    'if the Up arrow key is pressed then say "up"\n' +
    'if the space key is pressed then say "jump"\n' +
    'if the left arrow key is not pressed then say "not left"\n' +
    'if the a key is pressed then say "a"\n',
    { keys: { ArrowUp: true, ' ': true, a: true } }
  );
  assert.deepEqual([...output], ['up', 'jump', 'not left', 'a']);
  ok('key names work without quotes too');
}

{
  const { output } = await run(
    'add the "Keyboard" library\nsay "last key: " plus the key pressed\n',
    { keys: {} }
  );
  assert.deepEqual([...output], ['last key: ']);
  ok('the key pressed reads the most recent key');
}

await expectError('key checks need the Keyboard library',
  'if the "Up arrow" key is pressed then say "up"', /Keyboard library/);

// ============================================================
// Release 1.2 — ImprovedWait and ImprovedWaitLite
// ============================================================
console.log('\nRelease 1.2: library registry');

{
  // The classic libraries and the 1.2 ones have to agree on their names.
  assert.equal(EPP.Libraries.canonical('strings'), 'Text');
  assert.equal(EPP.Libraries.canonical('time'), 'Time');
  assert.equal(EPP.Libraries.canonical('files'), 'Files');
  assert.equal(EPP.Libraries.canonical('system'), 'System');
  assert.equal(EPP.Libraries.canonical('colors'), 'Colors');
  assert.equal(EPP.Libraries.canonical('console'), 'Console');
  assert.equal(EPP.Libraries.canonical('improved wait lite'), 'ImprovedWaitLite');
  assert.equal(EPP.Libraries.canonical('improved wait'), 'ImprovedWait');
  ok('every library name resolves, including the classic ones');

  // ImprovedWait is the superset: it owns the lite features too.
  const owners = EPP.Libraries.ownersOf('wait until');
  assert.ok(owners.indexOf('ImprovedWaitLite') !== -1 && owners.indexOf('ImprovedWait') !== -1);
  ok('ImprovedWait owns every ImprovedWaitLite feature');

  const actorOwners = EPP.Libraries.ownersOf('pause the actor');
  assert.deepEqual(actorOwners, ['ImprovedWait']);
  ok('actor control belongs to ImprovedWait alone');
}

{
  // An actor size is a multiplier; a huge number is a mistake worth explaining.
  const { output } = await run([
    'add library "Game"',
    "create the actor 'hero' with the image \"hero.png\"",
    "set the size of the actor 'hero' to 2"
  ].join('\n'));
  assert.equal(output.length, 0);
  ok('a sensible actor size is accepted');

  await expectError('an actor size that is really pixels is refused',
    ['add library "Game"', "create the actor 'hero' with the image \"hero.png\"",
     "set the size of the actor 'hero' to 72"].join('\n'),
    /multiplier/i);
}

console.log('\nRelease 1.2: ImprovedWait / ImprovedWaitLite');

{
  const { output } = await run(
    'add library "ImprovedWaitLite"\n' +
    'wait 1 second as \'intro\'\n' +
    'wait 1 second and then say "then ran"\n' +
    'define \'ready\' as 5\n' +
    'wait at most 2 seconds until \'ready\' is equal to 5\n' +
    'say "done"\n'
  );
  assert.deepEqual([...output], ['then ran', 'done']);
  ok('named waits, wait ... and then ..., and wait at most ... until ...');
}

{
  await expectError('wait until needs a variable that exists',
    'add library "ImprovedWaitLite"\nwait at most 1 second until \'ghost\' is equal to 1',
    /has not been defined/);
}

{
  const { output } = await run(
    'add library "ImprovedWaitLite"\n' +
    'wait 0.1 seconds as \'short\'\n' +
    'cancel the wait \'short\'\n' +
    'say "cancelled"\n'
  );
  assert.deepEqual([...output], ['cancelled']);
  ok('cancel the wait stops a named wait');
}

await expectError('wait for an actor needs ImprovedWait, not ImprovedWaitLite',
  'add library "ImprovedWaitLite"\nwait for the actor \'hero\' to finish',
  /ImprovedWait library/);

{
  const { output } = await run(
    'add library "ImprovedWait"\n' +
    'add the "Game" library\n' +
    'create the actor \'hero\' with the image "a.png"\n' +
    'stop the actor \'hero\'\n' +
    'wait for the actor \'hero\' to finish\n' +
    'say "actor finished"\n'
  );
  assert.deepEqual([...output], ['actor finished']);
  ok('ImprovedWait waits for an actor and can stop it from somewhere else');
}

{
  const { output } = await run(
    'add library "ImprovedWait"\n' +
    'add the "Game" library\n' +
    'create the actor \'enemy\' with the image "a.png"\n' +
    'pause the actor \'enemy\'\n' +
    '\'enemy\' move right "10"\n' +
    'resume the actor \'enemy\'\n' +
    '\'enemy\' move right "10"\n'
  );
  const state = EPP.Libraries.ownersOf('pause the actor');
  assert.deepEqual([...output], []);
  assert.ok(state.includes('ImprovedWait'));
  ok('a paused actor ignores movement until it is resumed');
}

console.log('\nRelease 1.2: the words the tutorials teach');
{
  const { output } = await run('let \'Who\' be "World"\nsay "Hello, ", \'Who\', "!"\n');
  assert.deepEqual([...output], ['Hello, World!'], 'three pieces joined by commas');

  const spaced = await run('let \'Name\' be "Ada"\nsay "Hello, ", \'Name\'\n');
  assert.deepEqual([...spaced.output], ['Hello, Ada'], 'a comma joins two pieces with a space');

  const tight = await run('let \'Word\' be "there"\nsay "Hi-", \'Word\'\n');
  assert.deepEqual([...tight.output], ['Hi-there'], 'no space is invented after punctuation');
  const spacedOnce = await run('let \'Word\' be "there"\nsay "Hi ", \'Word\'\n');
  assert.deepEqual([...spacedOnce.output], ['Hi there'], 'text that already ends in a space is not padded again');

  for (const connector of ['be', 'as', 'to']) {
    const result = await run('let \'N\' ' + connector + ' 4\nsay \'N\'\n');
    assert.deepEqual([...result.output], ['4'], 'let ... ' + connector);
    const defined = await run('define \'N\' ' + connector + ' 4\nsay \'N\'\n');
    assert.deepEqual([...defined.output], ['4'], 'define ... ' + connector);
  }

  const asked = await run('ask "Who?" and save the output as \'Who\'\nsay "Hi ", \'Who\'\n', { answers: ['Ada'] });
  assert.deepEqual([...asked.output], ['Hi Ada']);
  const askedIt = await run('ask "Who?" and save it as \'Who\'\nsay \'Who\'\n', { answers: ['Ada'] });
  assert.deepEqual([...askedIt.output], ['Ada'], 'ask ... and save it as');

  EPP.Libraries.showAll();
  const maths = await run(
    'add the "Math" library\n' +
    'say the square root of 144\n' +
    'say square root of 144\n' +
    'say 20 percent of 150\n' +
    'say 2 power of 3\n'
  );
  assert.deepEqual([...maths.output], ['12', '12', '30', '8'], 'the square root of and percent of');

  const mathsWords = await run(
    'add the "Math" library\n' +
    'say the minimum of 7 and 12\n' +
    'say the maximum of 7 and 12\n' +
    'say the absolute value of 0 minus 9\n' +
    'say the value of pi\n'
  );
  assert.deepEqual(mathsWords.output.slice(0, 3), ['7', '12', '9'], 'minimum, maximum and absolute value');
  assert.ok(Math.abs(Number(mathsWords.output[3]) - Math.PI) < 1e-9, 'the value of pi');

  const words = await run(
    'add the "Strings" library\n' +
    'say the uppercase of "e++"\n' +
    'say uppercase of "e++"\n' +
    'say the length of "hello"\n' +
    'say length of "hello"\n' +
    'say the lowercase of "E++"\n' +
    'say the reverse of "abc"\n' +
    'say the first letter of "hello"\n' +
    'say the last letter of "hello"\n' +
    'say the trim of "  padded  "\n'
  );
  assert.deepEqual([...words.output], ['E++', 'E++', '5', '5', 'e++', 'cba', 'h', 'o', 'padded'],
    'the ... of word tools');
  ok('say with commas, let/define with as/be/to, and the "the ... of" library words');

  const colonRepeat = await run('repeat 3 times:\n    say "hi"\nend repeat\n');
  assert.deepEqual([...colonRepeat.output], ['hi', 'hi', 'hi'], 'repeat ... times: opens a block');
  const plainRepeat = await run('repeat 2 times\n    say "ho"\nend repeat\n');
  assert.deepEqual([...plainRepeat.output], ['ho', 'ho']);

  const whileColon = await run(
    "let 'n' be 1\nwhile 'n' is less than 4:\n    say 'n'\n    let 'n' be 'n' plus 1\nend while\n"
  );
  assert.deepEqual([...whileColon.output], ['1', '2', '3'], 'while ... : opens a block');
  const whileDo = await run(
    "let 'n' be 1\nwhile 'n' is less than 3 do\n    say 'n'\n    let 'n' be 'n' plus 1\nend while\n"
  );
  assert.deepEqual([...whileDo.output], ['1', '2']);

  const colonIf = await run('if 1 is less than 2 then:\n    say "yes"\nend if\n');
  assert.deepEqual([...colonIf.output], ['yes'], 'if ... then: opens a block');
  const sum = await run(
    "let 'Total' be 0\nlet 'n' be 1\nwhile 'n' is less than 6 do\n    let 'Total' be 'Total' plus 'n'\n    let 'n' be 'n' plus 1\nend while\nsay 'Total'\n"
  );
  assert.deepEqual([...sum.output], ['15'], 'a counter and a running total');
  ok('repeat ... times, while ... do and if ... then: blocks (with and without the colon)');

  await expectError('a repeat without its end is refused',
    'repeat 3 times\n  say "hi"\n', /never ends/);
  await expectError('a word E++ does not know is refused',
    'say hello\n', /do not mean anything|does not mean anything/);
  ok('the two mistakes the tutorials teach you to read are still loud');
}

console.log('Tutorials');
{
  const T = EPP.Tutorials;
  assert.ok(T && Array.isArray(T.courses), 'Tutorials is loaded');

  const seen = new Set();
  let cards = 0;
  for (const course of T.courses) {
    assert.ok(course.id && course.title && course.icon, 'course ' + course.id + ' has an id, title and icon');
    assert.ok(course.steps.length > 0, course.id + ' has cards');
    for (const step of course.steps) {
      const id = course.id + '/' + step.id;
      assert.ok(!seen.has(id), 'card id is unique: ' + id);
      seen.add(id);
      cards += 1;
      assert.ok(step.title, id + ' has a title');
      assert.ok(step.goal, id + ' has a goal');
      assert.ok(Array.isArray(step.body) && step.body.length, id + ' explains something');
      assert.ok(typeof step.starter === 'string' && step.starter.trim(), id + ' has starting code');
      assert.ok(typeof step.solution === 'string' && step.solution.trim(), id + ' has a solution');
      assert.ok(Array.isArray(step.hints) && step.hints.length, id + ' has at least one hint');
      assert.ok(step.check && Object.keys(step.check).length, id + ' says what counts as correct');
    }
  }
  assert.strictEqual(T.totalSteps(), cards, 'totalSteps counts every card');
  ok(T.courses.length + ' courses, ' + cards + ' cards, all fully written');

  // Every solution must pass its own card, and every starter must fail it.
  // The deck is read the way the Studio builds it: `{wait}` resolved to the
  // waiting library this build actually has.
  EPP.Libraries.showAll();
  const deck = T.forBuild((name) => EPP.Libraries.isAvailable(name));
  for (const course of deck) {
    for (const step of course.steps) {
      const id = course.id + '/' + step.id;
      const keys = (step.test && step.test.keys) || {};
      const answers = [...((step.test && step.test.answers) || [])];

      let solutionResult;
      try {
        const runResult = await run(step.solution, { answers, keys, maxFrames: 60 });
        solutionResult = { output: runResult.output, error: null };
      } catch (error) {
        solutionResult = { output: [], error };
      }
      const solutionVerdict = T.check(step, solutionResult);
      assert.ok(solutionVerdict.ok, id + ': the solution must pass  ->  ' + solutionVerdict.message + '\n' + (solutionVerdict.detail || ''));

      let starterResult;
      try {
        const runResult = await run(step.starter, { answers: [...((step.test && step.test.answers) || [])], keys, maxFrames: 60 });
        starterResult = { output: runResult.output, error: null };
      } catch (error) {
        starterResult = { output: [], error };
      }
      const starterVerdict = T.check(step, starterResult);
      assert.ok(!starterVerdict.ok, id + ': the starting code must not already pass');
    }
  }
  ok(cards + ' card solutions pass and ' + cards + ' starters fail (marked by running the code)');

  // Every line a card shows the reader has to run as written. The one
  // exception is the card that is broken on purpose.
  let snippets = 0;
  for (const course of deck) {
    for (const step of course.steps) {
      if (step.id === 'fix-the-error') continue;
      for (const block of step.body) {
        if (block.code === undefined) continue;
        snippets += 1;
        try {
          await run(block.code + '\n', { answers: ['Ada'], maxFrames: 60 });
        } catch (error) {
          assert.fail(course.id + '/' + step.id + ': the example on the card does not run  ->  ' +
            (error.format ? error.format() : error.message) + '\n' + block.code);
        }
      }
    }
  }
  assert.ok(snippets >= cards - 1, 'every card except the deliberately broken one shows an example');
  ok(snippets + ' code samples shown on the cards run exactly as written');

  // The marking rules themselves.
  const sample = { check: { output: ['a', 'b'], notContains: ['nope'] } };
  assert.ok(T.check(sample, { output: ['a', 'b'], error: null }).ok);
  assert.ok(!T.check(sample, { output: ['a'], error: null }).ok, 'missing lines fail');
  assert.ok(!T.check(sample, { output: ['a', 'b', 'nope'], error: null }).ok, 'forbidden text fails');
  assert.ok(!T.check(sample, { output: ['a', 'b'], error: new Error('boom') }).ok, 'an error fails a card');

  const contains = { check: { contains: ['Rolling: '] } };
  assert.ok(T.check(contains, { output: ['Rolling: 4'], error: null }).ok);
  assert.ok(!T.check(contains, { output: ['Rolling'], error: null }).ok);

  const regexes = { check: { matches: [/^Rolling: [1-6]$/] } };
  assert.ok(T.check(regexes, { output: ['Rolling: 3'], error: null }).ok);
  assert.ok(!T.check(regexes, { output: ['Rolling: 9'], error: null }).ok);

  const errorCard = { check: { error: /library/ } };
  assert.ok(T.check(errorCard, { output: [], error: { reason: 'That needs the Math library.' } }).ok);
  assert.ok(!T.check(errorCard, { output: [], error: { reason: 'something else' } }).ok);
  assert.ok(!T.check(errorCard, { output: [], error: null }).ok, 'a card expecting an error fails if the program runs');
  ok('the marker compares real output, forbidden text, patterns and errors');

  const verdict = T.check({ check: { output: ['Hello'] } }, { output: ['Goodbye'], error: null });
  assert.ok(/printed/i.test(verdict.message), 'a wrong answer says the output was not what the card wanted');
  assert.ok(/Expected:/.test(verdict.detail) && /Your program printed:/.test(verdict.detail),
    'a wrong answer shows what was expected next to what the program printed');
  ok('a failed card explains the expected and the actual output');

  // Builds that leave a library out hide the cards that need it.
  const withoutGame = T.forBuild((name) => name !== 'Game');
  assert.ok(withoutGame.every((course) => !(course.needs || []).includes('Game')), 'courses that need a missing library are hidden');
  assert.ok(withoutGame.every((course) => course.steps.every((step) => !(step.needs || []).includes('Game'))), 'cards that need a missing library are hidden');
  const withGame = T.forBuild(() => true);
  assert.strictEqual(withGame.length, T.courses.length, 'every course exists when every library is available');
  ok('Tutorials.forBuild hides only what this build cannot run');

  assert.ok(/^epp_tutorial/.test(T.progressKey), 'progress has its own key');
  const step = T.courses[0].steps[0];
  assert.strictEqual(T.findStep(T.courses[0].id, step.id), step, 'findStep looks a card up');
  assert.deepEqual([...T.requirementsOf(T.courses[0], step)], [...(T.courses[0].needs || []), ...(step.needs || [])],
    'requirementsOf lists the libraries a card needs');
  ok('progress is stored per card under ' + T.progressKey);
}

// ============================================================
// Release 1.2.1 — one Studio, one E++.zip, no overlap
// ============================================================
console.log('\nRelease 1.2.1: the two builds');

{
  // The Studio keeps ImprovedWait (actors and all) and hides Its Lite twin.
  const studioMissing = EPP.Libraries.applyBuild('studio');
  assert.deepEqual([...studioMissing], ['ImprovedWaitLite'], 'the Studio hides exactly ImprovedWaitLite');
  assert.equal(EPP.Libraries.isAvailable('ImprovedWait'), true);
  assert.equal(EPP.Libraries.isAvailable('Game'), true);
  assert.equal(EPP.Libraries.isAvailable('ImprovedWaitLite'), false);
  assert.match(EPP.Libraries.whyUnavailable('ImprovedWaitLite'), /E\+\+\.zip/i,
    'the Studio says where the Lite library lives');
  ok('the Studio has everything except ImprovedWaitLite');

  // The wait feature must still name an owner the Studio actually has.
  const studioWaitOwners = EPP.Libraries.ownersOf('wait until');
  assert.ok(studioWaitOwners.indexOf('ImprovedWaitLite') === -1, 'a hidden library never owns a feature');
  assert.ok(studioWaitOwners.indexOf('ImprovedWait') !== -1, 'ImprovedWait covers the lite features here');
  assert.deepEqual([...EPP.Libraries.ownersOf('pause the actor')], ['ImprovedWait']);
  ok('the wait wording points at ImprovedWait inside the Studio');

  await expectError('the Studio refuses `add library "ImprovedWaitLite"`',
    'add library "ImprovedWaitLite"\nwait 1 second', /E\+\+\.zip/i);

  // E++.zip is the mirror image: Lite in, Game and ImprovedWait out.
  const zipMissing = EPP.Libraries.applyBuild('distribution').slice().sort();
  assert.deepEqual(zipMissing, ['Game', 'ImprovedWait']);
  assert.equal(EPP.Libraries.isAvailable('ImprovedWaitLite'), true);
  assert.equal(EPP.Libraries.isAvailable('Keyboard'), true);
  assert.equal(EPP.Libraries.isAvailable('Game'), false);
  assert.equal(EPP.Libraries.isAvailable('ImprovedWait'), false);
  assert.match(EPP.Libraries.whyUnavailable('Game'), /Studio/i);
  ok('E++.zip has ImprovedWaitLite and leaves Game/ImprovedWait out');

  assert.deepEqual([...EPP.Libraries.ownersOf('wait until')], ['ImprovedWaitLite'],
    'inside the zip the wait feature belongs to ImprovedWaitLite');

  // The Lite library really runs there, and the missing one really explains.
  const { output } = await run('add library "ImprovedWaitLite"\nwait 0.1 seconds as \'tick\'\nsay "zip ok"');
  assert.deepEqual([...output], ['zip ok']);
  await expectError('E++.zip explains where Game went',
    'add library "Game"', /Studio/i);
  ok('the zip runs ImprovedWaitLite and explains the missing Game library');

  // The build table is the single source of truth for both directions.
  assert.deepEqual([...EPP.Libraries.missingFor('studio')], ['ImprovedWaitLite']);
  assert.deepEqual([...EPP.Libraries.missingFor('distribution')].sort(), ['Game', 'ImprovedWait']);
  EPP.Libraries.showAll();
  assert.equal(EPP.Libraries.isAvailable('ImprovedWaitLite'), true, 'showAll restores everything');
  assert.equal(EPP.Libraries.isAvailable('Game'), true);
  ok('applyBuild()/missingFor() describe both builds and showAll() clears them');
}

{
  // The tutorial deck follows the build: no card may tell a zip user to add a
  // library that build does not have (or a Studio user about ImprovedWaitLite).
  const T = EPP.Tutorials;
  const studio = EPP.Libraries.applyBuild('studio');
  const studioDeck = T.forBuild((name) => EPP.Libraries.isAvailable(name));
  EPP.Libraries.applyBuild('distribution');
  const zipDeck = T.forBuild((name) => EPP.Libraries.isAvailable(name));

  const text = (deck) => JSON.stringify(deck);
  assert.ok(studioDeck.length > 0 && zipDeck.length > 0, 'both builds get a deck');
  assert.ok(!/ImprovedWaitLite/.test(text(studioDeck)), 'the Studio deck never mentions ImprovedWaitLite');
  assert.ok(!/"ImprovedWait"/.test(text(zipDeck)), 'the zip deck never asks for ImprovedWait');
  assert.ok(!/"Game"/.test(text(zipDeck)), 'the zip deck never asks for Game');
  assert.ok(/ImprovedWaitLite/.test(text(zipDeck)), 'the zip deck waits with ImprovedWaitLite');
  assert.ok(T.totalSteps(studioDeck) > T.totalSteps(zipDeck), 'the zip loses the game cards');
  const dropped = studioDeck.filter((course) => !zipDeck.some((z) => z.id === course.id))
    .map((course) => course.id);
  assert.deepEqual(dropped, ['games'], 'the zip drops the game course, which cannot run without Game');
  assert.ok(zipDeck.every((course) => course.hiddenSteps === 0), 'no zip course is left half-empty');
  assert.ok(studioDeck.every((course) => course.hiddenSteps === 0), 'the Studio deck is complete');
  ok('each build gets only the tutorial cards it can actually run');

  // And the placeholder itself is not a library name.
  assert.deepEqual([...studio], ['ImprovedWaitLite']);
  EPP.Libraries.showAll();
  assert.equal(T.waitLibraryFor((name) => name !== 'ImprovedWaitLite'), 'ImprovedWait');
  assert.equal(T.waitLibraryFor(() => true), 'ImprovedWait');
  assert.equal(T.fillPlaceholders('add the "{wait}" library', { wait: 'ImprovedWaitLite' }),
    'add the "ImprovedWaitLite" library');
  ok('{wait} resolves to the waiting library this build has');
}

// ============================================================
// Release 1.2.1 — the community idea tracker
// ============================================================
console.log('\nRelease 1.2.1: suggest a feature');

{
  const I = EPP.Ideas;
  assert.ok(I, 'js/ideas.js publishes EPP.Ideas');

  const post = I.postUrl('Let me draw circles in the Game library\nand colour them');
  assert.ok(post.startsWith('https://github.com/the-creative-master/E-Plus-Plus/issues/new?'), post);
  assert.ok(post.includes('labels=feature-request'), 'the idea is labelled for the shared list');
  const query = new URLSearchParams(post.split('?')[1]);
  assert.ok(query.get('title').startsWith('[Idea] '), 'the title carries the idea mark');
  assert.strictEqual(query.get('title'), '[Idea] Let me draw circles in the Game library',
    'the first line becomes the title');
  assert.ok(query.get('body').includes('and colour them'), 'the whole idea becomes the body');
  ok('an idea becomes a prefilled public issue');

  const empty = new URLSearchParams(I.postUrl('   ').split('?')[1]);
  assert.ok(empty.get('title').startsWith('[Idea] '), 'even an empty box gets a usable title');
  ok('posting with an empty box still opens a usable issue');

  const fixture = [
    // An idea posted by someone outside the project: no label, only the title.
    { title: '[Idea] a dark theme', html_url: 'https://x/1', state: 'open', comments: 3,
      user: { login: 'someone' }, created_at: '2026-10-01T10:00:00Z', reactions: { '+1': 4 } },
    // An idea labelled by a maintainer: no prefix needed.
    { title: 'Sound support', html_url: 'https://x/2', state: 'closed', comments: 0,
      labels: [{ name: 'feature-request' }], user: { login: 'maintainer' }, created_at: '2026-09-02T00:00:00Z' },
    // Ordinary bug reports and pull requests are not ideas.
    { title: 'Crash on empty file', html_url: 'https://x/3', labels: [{ name: 'bug' }] },
    { title: '[Idea] looks like a PR', html_url: 'https://x/4', pull_request: { url: 'x' } }
  ];
  const ideas = I.parseIssues(fixture);
  assert.deepEqual(ideas.map((idea) => idea.title), ['a dark theme', 'Sound support'],
    'both marks are accepted, and the prefix is stripped');
  assert.strictEqual(ideas[0].votes, 4);
  assert.strictEqual(ideas[0].author, 'someone');
  assert.strictEqual(ideas[0].date, '2026-10-01');
  assert.strictEqual(ideas[1].state, 'closed');
  ok('the list accepts labelled ideas and [Idea] titles, and skips everything else');

  assert.deepEqual(I.parseIssues(null), []);
  assert.deepEqual(I.parseIssues({}), []);
  assert.deepEqual(I.parseIssues([]), []);
  ok('a broken or empty API answer is an empty list, not a crash');

  assert.ok(I.issuesUrl().includes('/issues?') && I.issuesUrl().includes('%5BIdea%5D'),
    'there is always a plain link to the public list');

  // The page must survive a browser with no network at all (the preview case).
  await assert.rejects(
    () => I.fetchIdeas({ fetch: () => { throw new Error('offline'); } }),
    /offline/
  );
  const refused = await I.fetchIdeas({
    fetch: async () => ({ ok: false, status: 403, json: async () => [] })
  }).then(() => 'resolved', (error) => error.message);
  assert.match(String(refused), /403/, 'a refused request reports the status');
  const live = await I.fetchIdeas({
    fetch: async () => ({
      ok: true,
      json: async () => [
        { title: '[Idea] made up', html_url: 'https://x/9', labels: [], state: 'open',
          user: { login: 'tester' }, created_at: '2026-10-24T00:00:00Z', reactions: { '+1': 1 } }
      ]
    })
  });
  assert.deepEqual(live.map((idea) => idea.title), ['made up']);
  ok('ideas are read through a fetch the tests can stand in for');

  const cached = I.fromCache(I.toCache(ideas, 1000), 1000);
  assert.deepEqual(cached.map((idea) => idea.url), ['https://x/1', 'https://x/2']);
  assert.strictEqual(I.fromCache('not json', 1000), null);
  assert.strictEqual(I.fromCache(I.toCache(ideas, 1), 1 + 7 * 60 * 60 * 1000), null,
    'a stale cache is not shown as though it were current');
  ok('the last good list is cached, and an old one is dropped');
}

// ============================================================
// Release 1.2.1 — keyboard, dialogs and page wiring
// ============================================================
console.log('\nRelease 1.2.1: typing keeps its keys');

{
  const Tracker = EPP.Keys.Tracker;
  const tracker = new Tracker();
  const press = (key, tag, extra) => Object.assign(
    { key: key, target: Object.assign({ tagName: tag }, extra || {}) });

  assert.strictEqual(tracker.shouldPreventScroll(press(' ', 'TEXTAREA')), false,
    'space in the editor is a space, not a page scroll');
  assert.strictEqual(tracker.shouldPreventScroll(press('ArrowUp', 'INPUT')), false);
  assert.strictEqual(tracker.shouldPreventScroll(press(' ', 'DIV', { isContentEditable: true })), false);
  assert.strictEqual(tracker.shouldPreventScroll(press('ArrowLeft', 'SELECT')), false);
  assert.strictEqual(tracker.shouldPreventScroll(press(' ', 'BODY')), true,
    'a running game still swallows space');
  assert.strictEqual(tracker.shouldPreventScroll(press('ArrowDown', 'CANVAS')), true);
  assert.strictEqual(tracker.shouldPreventScroll(press('a', 'BODY')), false,
    'a letter never scrolls anything');
  assert.strictEqual(tracker.shouldPreventScroll(' '), true, 'a bare key name still works');
  assert.strictEqual(tracker.shouldPreventScroll('ArrowUp'), true);
  ok('space and arrows are swallowed by a game, never by a text field');
}

{
  // The Studio must not reach for the browser's blocking dialogs any more.
  const page = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!/\bwindow\.(alert|confirm|prompt)\s*\(/.test(page), 'no window.alert/confirm/prompt');
  assert.ok(!/(^|[^.\w])(alert|confirm)\s*\(\s*['"`]/.test(page), 'no bare alert/confirm call');
  assert.ok(page.includes('function askDialog('), 'askDialog() is the text prompt');
  assert.ok(page.includes('function confirmDialog('), 'confirmDialog() is the yes/no prompt');
  assert.ok(page.includes('id="askOverlay"') && page.includes('id="askOk"') && page.includes('id="askCancel"'),
    'the in-page dialog exists in the markup');
  ok('the page asks through its own dialogs, never through alert/confirm/prompt');

  assert.ok(page.includes('id="btnSuggest"'), 'the toolbar has a Suggest button');
  assert.ok(page.includes('id="suggestOverlay"') && page.includes('id="sugText"'), 'the ideas panel exists');
  assert.ok(page.includes('id="sugList"'), 'existing ideas are listed in the panel');
  assert.ok(page.includes('js/ideas.js'), 'the panel uses the shared ideas module');
  assert.ok(/api\.fetchIdeas\(/.test(page), 'the panel reads the public list, not a local one');

  // The version the page announces matches this release everywhere it shows.
  assert.ok(page.includes('<title>E++ Studio | 1.2.1</title>'), 'the tab title is 1.2.1');
  assert.ok(page.includes('class="build-badge">1.2.1<'), 'the header badge is 1.2.1');
  assert.ok(page.includes("const DEFAULTS_VERSION = '1.2.1'"), 'the defaults stamp is 1.2.1');
  assert.ok(page.includes("epp_idea_draft_1_2_1"), 'the idea draft key is per release');
  ok('the page announces 1.2.1 and the new keys are versioned');

  // Every library card is bound to a registry name, so a build can hide it.
  const cards = page.match(/data-library="[^"]+"/g) || [];
  assert.ok(cards.length >= 11, 'every library card names its library (' + cards.length + ')');
  assert.ok(page.includes('function applyBuildLibraries('), 'the page applies the build split on load');
  assert.ok(page.includes("getElementById('studioNotice')") && page.includes("getElementById('distributionNotice')"),
    'each build gets its own note');
  ok('a build can hide a library card and explain why');

  assert.ok(readFileSync(join(root, 'js', 'tutorials.js'), 'utf8').includes("PROGRESS_KEY = 'epp_tutorial_progress_1_2'"),
    'tutorial progress keeps its 1.2 key, so upgrading does not wipe it');
}

// ============================================================
// 1.2.1 follow-up — focus stays inside an open panel
// ============================================================
console.log('\nPanels: focus and Tab');

{
  const A = EPP.A11y;
  assert.ok(A, 'js/a11y.js publishes EPP.A11y');

  const el = (tagName, extra) => Object.assign({ tagName: tagName }, extra || {});
  assert.strictEqual(A.isFocusable(el('BUTTON')), true, 'a button is a Tab stop');
  assert.strictEqual(A.isFocusable(el('A', { href: '#x' })), true, 'a link with an href is one');
  assert.strictEqual(A.isFocusable(el('A')), false, 'a link without an href is not');
  assert.strictEqual(A.isFocusable(el('BUTTON', { disabled: true })), false, 'a disabled button is skipped');
  assert.strictEqual(A.isFocusable(el('INPUT', { type: 'hidden' })), false, 'a hidden input is skipped');
  assert.strictEqual(A.isFocusable(el('INPUT', { type: 'file' })), false, 'a file picker is skipped');
  assert.strictEqual(A.isFocusable(el('DIV')), false, 'a plain div is not a stop');
  assert.strictEqual(A.isFocusable(el('DIV', { tabIndex: 0 })), true, 'unless it is given a tabindex');
  assert.strictEqual(A.isFocusable(el('TEXTAREA', { hidden: true })), false, 'a hidden field is skipped');
  assert.strictEqual(A.isFocusable(null), false);
  ok('only things a keyboard can actually reach are Tab stops');

  const list = [
    el('H2'),
    el('TEXTAREA'),
    el('BUTTON', { disabled: true }),
    el('A', { href: '#post' }),
    el('INPUT', { type: 'text' })
  ];
  const kept = A.focusables(list);
  assert.strictEqual(kept.length, 3, 'the panel leaves the title and the disabled button out');
  assert.strictEqual(kept[0], list[1], 'order is preserved');
  assert.strictEqual(A.firstFocusable(list), list[1], 'opening the panel lands on the first stop');
  assert.strictEqual(A.firstFocusable([el('H2')]), null, 'a panel with nothing to focus says so');
  ok('a fresh panel focuses its first real field');

  // The ring: forward from the last stop wraps to the first, and back again.
  assert.strictEqual(A.nextIndex(3, 0, false), 1);
  assert.strictEqual(A.nextIndex(3, 2, false), 0, 'Tab on the last stop comes back to the first');
  assert.strictEqual(A.nextIndex(3, 0, true), 2, 'Shift+Tab on the first stop goes to the last');
  assert.strictEqual(A.nextIndex(3, -1, false), 0, 'focus outside the ring enters at the front');
  assert.strictEqual(A.nextIndex(3, -1, true), 2, 'or at the back, going backwards');
  assert.strictEqual(A.nextIndex(0, 0, false), -1, 'an empty panel has nowhere to go');
  ok('Tab wraps at both ends and never escapes the panel');
}

{
  // The page must use that helper for all three panels, and keep the page
  // behind a panel from scrolling under the pointer.
  const page = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'css', 'ide.css'), 'utf8');
  assert.ok(page.includes('js/a11y.js'), 'the Studio loads the focus helper');
  assert.ok(page.includes('function openModal(') && page.includes('function closeModal('),
    'panels open and close through one pair of helpers');
  for (const id of ['tutorialOverlay', 'suggestOverlay', 'askOverlay']) {
    assert.ok(page.includes("'" + id + "'"), 'the ' + id + ' is covered by the shared rules');
  }
  assert.ok(page.includes('document.addEventListener(\'keydown\', trapModalTab, true)'),
    'the Tab trap is armed once, in the capture phase');
  assert.ok(/body\.modal-open\s*\{\s*overflow:\s*hidden/.test(css), 'the page behind a panel does not scroll');
  assert.ok(page.includes('showToast'), 'toasts still exist');
  ok('every panel opens, traps Tab and closes through the same helpers');
}

// Restore the full library set for any later test.
EPP.Libraries.showAll();

console.log('\nAll ' + passed + ' E++ test groups passed.');
