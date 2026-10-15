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
  DataView, TextEncoder, TextDecoder, Blob: undefined, Symbol
});
context.window = context;
context.globalThis = context;

for (const file of [
  'errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'parser.js',
  'python-runner.js', 'interpreter.js', 'files.js', 'highlight.js', 'standalone-generator.js'
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

console.log('\nAll ' + passed + ' E++ test groups passed.');
