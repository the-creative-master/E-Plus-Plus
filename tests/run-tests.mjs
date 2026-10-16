/**
 * Headless test-suite for the E++ language core (Dev Build 6.1.1).
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
  DataView, TextEncoder, TextDecoder, Blob: undefined, Symbol
});
context.window = context;
context.globalThis = context;

for (const file of [
  'errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'parser.js',
  'python-runner.js', 'interpreter.js', 'files.js', 'highlight.js', 'standalone-generator.js',
  'tutorial-pack.js', 'tutorial.js', 'settings-schema.js', 'settings.js'
]) {
  vm.runInContext(readFileSync(join(root, 'js', file), 'utf8'), context, { filename: file });
}
const EPP = context.EPP;
context.localStorage = new EPP.MemoryStorage();
assert.ok(EPP && EPP.Lexer && EPP.Parser && EPP.Interpreter, 'E++ core loaded');

let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }

async function run(source, options = {}) {
  const output = [];
  const answers = [...(options.answers || [])];
  const interpreter = await EPP.run(source, {
    output: (t) => output.push(t),
    input: async () => answers.shift() ?? '',
    delay: async () => {},
    pythonExecutor: options.pythonExecutor,
  });
  return { output, interpreter };
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

// ===== Dev Build 6.1.1: tutorial lesson pack (no longer hardbaked) =====
console.log('\n--- Dev Build 6.1.1: External Tutorial Lesson Pack ---');
{
  const packPath = join(root, 'tutorial', 'pack.json');
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  assert.equal(pack.format, 'eplusplus-tutorial-pack');
  assert.ok(pack.lessons.length >= 8, 'the official pack ships a full set of lessons');

  const ids = new Set();
  for (const lesson of pack.lessons) {
    assert.ok(lesson.id && lesson.title && lesson.badge && lesson.summary && lesson.explanation, `lesson ${lesson.id} is complete`);
    assert.ok(!ids.has(lesson.id), `lesson id ${lesson.id} is unique`);
    ids.add(lesson.id);
  }
  ok('tutorial/pack.json holds valid, uniquely identified lessons');

  // Every lesson must be runnable E++ — a broken example is a broken tutorial.
  for (const lesson of pack.lessons) {
    const fileName = EPP.Tutorial.suggestFileName(lesson);
    assert.ok(EPP.isEpplFile(fileName), `lesson ${lesson.id} maps to a .eppl/.eppla file name`);
    EPP.Parser.parse(lesson.code, { fileName });
  }
  ok('every lesson example parses as E++ (and picks the right .eppl / .eppla name)');

  const parsed = EPP.Tutorial.parsePack(readFileSync(packPath, 'utf8'));
  assert.ok(parsed.ok, 'the shipped pack passes pack validation');

  const broken = EPP.Tutorial.parsePack('{"lessons": [{"id": "x"}]}');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /needs a "title"/);
  const notJson = EPP.Tutorial.parsePack('not json at all');
  assert.equal(notJson.ok, false);
  assert.match(notJson.error, /not valid JSON/);
  ok('broken lesson packs are rejected with a readable English error');
}

{
  const loaded = await EPP.Tutorial.load();
  assert.equal(loaded.lessons.length, JSON.parse(readFileSync(join(root, 'tutorial', 'pack.json'), 'utf8')).lessons.length);
  assert.equal(loaded.custom.length, 0);
  ok('EPP.Tutorial.load() falls back to the generated pack when there is no server to fetch from');
}

{
  const before = (await EPP.Tutorial.load()).lessons;
  const added = EPP.Tutorial.addCustomLesson({
    title: 'My own lesson',
    badge: 'Mine',
    summary: 'Written by the person using the IDE.',
    explanation: 'Saved from the editor.',
    code: 'say "hi from my lesson"\n'
  }, before);
  assert.ok(added.ok, added.error);
  assert.equal(added.lesson.id, 'my-own-lesson');
  assert.equal(added.lesson.custom, true);
  assert.equal(added.lesson.fileName, 'tutorial-my-own-lesson.eppl');

  const merged = await EPP.Tutorial.load();
  assert.equal(merged.lessons.length, before.length + 1);
  assert.equal(merged.lessons[merged.lessons.length - 1].custom, true);

  const exported = JSON.parse(EPP.Tutorial.exportPack(merged.pack));
  assert.equal(exported.format, 'eplusplus-tutorial-pack');
  assert.equal(exported.lessons.length, merged.lessons.length);
  ok('custom lessons can be added, reloaded, and exported as a lesson pack');

  EPP.Tutorial.removeCustomLesson('my-own-lesson');
  assert.equal((await EPP.Tutorial.load()).lessons.length, before.length);
  EPP.Tutorial.addCustomLesson({ title: 'My own lesson', summary: 's', badge: 'b', code: 'say "x"' }, before);
  EPP.Tutorial.clearCustomLessons();
  assert.equal((await EPP.Tutorial.load()).custom.length, 0);
  ok('custom lessons can be removed individually or all at once');
}

{
  assert.deepEqual(EPP.Tutorial.getProgress().visited, []);
  EPP.Tutorial.visitLesson(2, 'maths');
  assert.deepEqual(EPP.Tutorial.getProgress().visited, ['maths']);
  assert.equal(EPP.Tutorial.getProgress().lastStep, 2);
  EPP.Tutorial.resetProgress();
  assert.deepEqual(EPP.Tutorial.getProgress().visited, []);
  ok('lesson progress is remembered and can be reset');
}

{
  const ideSource = readFileSync(join(root, 'js', 'ide.js'), 'utf8');
  const pack = JSON.parse(readFileSync(join(root, 'tutorial', 'pack.json'), 'utf8'));
  assert.ok(!/TUTORIAL_LESSONS/.test(ideSource), 'the IDE must not hardbake a lesson array');
  for (const lesson of pack.lessons) {
    assert.ok(!ideSource.includes(lesson.summary), `lesson "${lesson.id}" summary must not live in ide.js`);
    assert.ok(!ideSource.includes(lesson.explanation), `lesson "${lesson.id}" explanation must not live in ide.js`);
  }
  ok('ide.js renders the lesson pack instead of hardbaking tutorial content');

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('js/tutorial.js'), 'the IDE loads the tutorial engine');
  assert.ok(html.includes('js/tutorial-pack.js'), 'the IDE loads the offline lesson pack fallback');
  assert.ok(html.includes('js/settings.js') && html.includes('js/settings-schema.js'), 'the IDE loads the settings engine and schema');
  assert.ok(html.includes('Dev Build 6.1.1'), 'the IDE is labelled Dev Build 6.1.1');
  ok('index.html wires the lesson pack, the settings engine and the build label');
}


// ===== Dev Build 6.1.1: settings are data, not hardbaked markup =====
console.log('\n--- Dev Build 6.1.1: Data-Driven Settings ---');
{
  const schemaPath = join(root, 'settings', 'schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.format, 'eplusplus-settings-schema');
  assert.ok(schema.groups.length >= 5, 'the schema ships every settings group');
  assert.equal(EPP.Settings.validate(schema).length, 0, 'the shipped schema is valid');

  const keys = [];
  for (const group of schema.groups) {
    for (const control of group.controls) {
      if (control.key) keys.push(control.key);
    }
  }
  for (const wanted of ['theme', 'density', 'consoleHeight', 'editorFontSize', 'showDashboard',
    'showLineNumbers', 'showLibrariesPanel', 'showHelpPanel', 'tabSize', 'tabChar', 'wordWrap',
    'autoSave', 'autoSaveDelay', 'autoEppla', 'clearConsoleOnRun', 'confirmDelete',
    'restoreLastFile', 'autoOpenTutorial']) {
    assert.ok(keys.includes(wanted), `the schema still offers the ${wanted} setting`);
  }
  ok('settings/schema.json defines every group, control and default');

  const parsed = EPP.Settings.parseSchema(readFileSync(schemaPath, 'utf8'));
  assert.ok(parsed.ok, 'the shipped schema passes validation');
  const badType = EPP.Settings.parseSchemaValue({ format: 'eplusplus-settings-schema', groups: [{ id: 'g', title: 'G', controls: [{ key: 'k', type: 'slider', label: 'K', default: 1 }] }] });
  assert.equal(badType.ok, false);
  assert.match(badType.error, /unknown type "slider"/);
  const badDefault = EPP.Settings.parseSchemaValue({ format: 'eplusplus-settings-schema', groups: [{ id: 'g', title: 'G', controls: [{ key: 'k', type: 'select', label: 'K', default: 'z', options: [{ value: 'a', label: 'A' }] }] }] });
  assert.equal(badDefault.ok, false);
  assert.match(badDefault.error, /not one of its options/);
  ok('broken settings schemas are rejected with a readable English error');
}

{
  const loaded = await EPP.Settings.load();
  const schema = JSON.parse(readFileSync(join(root, 'settings', 'schema.json'), 'utf8'));
  assert.equal(loaded.schema.groups.length, schema.groups.length);
  assert.match(loaded.source, /bundled schema/);
  ok('EPP.Settings.load() falls back to the generated schema without a server');
}

{
  const schema = JSON.parse(readFileSync(join(root, 'settings', 'schema.json'), 'utf8'));
  const defaults = EPP.Settings.defaults(schema);
  assert.equal(defaults.theme, 'dark');
  assert.equal(defaults.editorFontSize, 14);
  assert.equal(defaults.tabSize, 2);
  assert.equal(defaults.autoOpenTutorial, true);
  assert.equal(typeof defaults.wordWrap, 'boolean');
  assert.equal(EPP.Settings.coerce(schema, 'editorFontSize', '18'), 18);
  assert.equal(EPP.Settings.coerce(schema, 'tabSize', '4'), 4);
  assert.equal(EPP.Settings.coerce(schema, 'theme', 'light'), 'light');
  ok('defaults, types and coercion all come from the schema');

  const merged = EPP.Settings.mergeStored(schema, { editorFontSize: 16, theme: 'light', notASetting: 5 });
  assert.equal(merged.editorFontSize, 16);
  assert.equal(merged.theme, 'light');
  assert.equal(merged.notASetting, undefined);
  assert.equal(merged.autoSave, true, 'missing values fall back to schema defaults');
  const wrongType = EPP.Settings.mergeStored(schema, { editorFontSize: 'huge' });
  assert.equal(wrongType.editorFontSize, 14, 'values of the wrong type are ignored');
  ok('stored settings merge with the schema defaults and unknown keys are dropped');
}

{
  const schema = JSON.parse(readFileSync(join(root, 'settings', 'schema.json'), 'utf8'));
  const classes = new Set();
  const vars = {};
  const body = {
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); }
    },
    style: { setProperty: (k, v) => { vars[k] = v; } }
  };
  const settings = EPP.Settings.defaults(schema);
  EPP.Settings.applyAll(settings, schema, { body });
  assert.ok(!classes.has('light-theme'), 'dark is the default theme');
  assert.equal(vars['--code-font-size'], '14px');
  assert.equal(vars['--tab-size'], '2');
  assert.ok(!classes.has('hide-dashboard'));

  settings.theme = 'light';
  settings.density = 'compact';
  settings.consoleHeight = 'tall';
  settings.wordWrap = true;
  settings.showHelpPanel = false;
  settings.editorFontSize = 18;
  settings.tabSize = 4;
  EPP.Settings.applyAll(settings, schema, { body });
  assert.ok(classes.has('light-theme'));
  assert.ok(classes.has('compact-ui'));
  assert.ok(classes.has('console-tall') && !classes.has('console-compact'));
  assert.ok(classes.has('wrap-code'));
  assert.ok(classes.has('hide-help-panel'), 'a falsy toggle class only appears when the toggle is off');
  assert.equal(vars['--code-font-size'], '18px');
  assert.equal(vars['--tab-size'], '4');
  ok('setting effects (classes, class maps, css variables) are applied from the schema');
}

{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const ideSource = readFileSync(join(root, 'js', 'ide.js'), 'utf8');
  const schema = JSON.parse(readFileSync(join(root, 'settings', 'schema.json'), 'utf8'));

  assert.ok(!/data-setting=/.test(html), 'index.html must not hardbake settings controls');
  assert.ok(html.includes('id="settingsGroups"'), 'the dialog exposes an empty host to render into');
  assert.ok(/<div class="settings-body" id="settingsGroups"><\/div>/.test(html), 'that host ships empty');

  for (const group of schema.groups) {
    assert.ok(!html.includes('>' + group.title + '<'), `the group title "${group.title}" must not live in index.html`);
  }
  for (const control of EPP.Settings.controls(schema)) {
    if (!control.label) continue;
    assert.ok(!html.includes(control.label), `the label "${control.label}" must not live in index.html`);
    const asString = new RegExp("['\"]" + control.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]");
    assert.ok(!asString.test(ideSource), `the label "${control.label}" must not be written out in ide.js`);
    if (control.notes) {
      for (const note of Object.values(control.notes)) {
        assert.ok(!ideSource.includes(note), `the note text must come from the schema, not ide.js`);
      }
    }
  }
  assert.ok(!/var DEFAULT_SETTINGS/.test(ideSource), 'the defaults must come from the schema, not ide.js');
  assert.ok(!/settingsResetTutorial|settingsRestoreExamples|settingsWipe/.test(ideSource),
    'action buttons are wired by their schema-declared action, not by hardcoded ids');
  ok('no settings markup or labels are hardbaked in index.html or js/ide.js');
}


console.log('\nAll ' + passed + ' E++ test groups passed.');
