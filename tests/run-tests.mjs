/**
 * Headless test-suite for the E++ language core.
 * Loads the exact same browser scripts the IDE uses (in index.html order)
 * into a VM context, then exercises lexer -> parser -> AST -> interpreter,
 * the library system and the .eppl file store.
 *
 * Run: npm test   (or: node tests/run-tests.mjs)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, setTimeout, clearTimeout, Promise, Math, JSON, Date, Map, Set, Error, Number, String, Array, Object, RegExp, Blob: undefined });
context.window = undefined; // language core falls back to globalThis in the VM

for (const file of ['errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'parser.js', 'interpreter.js', 'files.js', 'highlight.js']) {
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
  const tokens = EPP.Lexer.tokenize('Define name as Adonis.\nsay \'name\'');
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
  const { output } = await run('Define name as Adonis.\nsay "Hello " plus \'name\' plus "!"');
  assert.deepEqual([...output], ['Hello Adonis!']);
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
  const right = await run('ask "5 plus 6?" and save answer as output\nif output is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['11'] });
  const wrong = await run('ask "5 plus 6?" and save answer as output\nif output is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['9'] });
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
  const { output } = await run('Define name as Adonis.\nsay \'name\'\nDefine greeting as Hello there.\nsay \'greeting\'');
  assert.deepEqual([...output], ['Adonis', 'Hello there']);
  ok('Define <name> as <bare words> still stores the literal words (spec example)');
}
{
  const { output } = await run('Define count as 3.\nif count is equal to 3 then say "three" otherwise say "other"');
  assert.deepEqual([...output], ['three']);
  ok('a bare word that IS a defined variable still works (if output is equal to ...)');
}
{
  // The lexer is generic: it knows nothing about Python at all. A dash
  // block fed to the lexer alone is just an unterminated string; the
  // parser extracts Python blocks before lexing (tested below).
  assert.throws(() => EPP.Lexer.tokenize('python code "-print(1)\nprint(2)\n"'), /never ends/);
  ok('the lexer has no Python knowledge (dash blocks are a parser concern)');
}

console.log('Python-looking code is not E++');
await expectError('print("HELLO") does not print anything', 'print("HELLO")', /is Python, not E\+\+, so E\+\+ will not run it/);
await expectError('PRINT("HELLO") does not print anything either', 'PRINT("HELLO")', /is Python, not E\+\+/);
await expectError('bare print is refused even WITH the Python library', 'library "Python" add\nprint("HELLO")', /is Python, not E\+\+/);
await expectError('print with a bare word is refused too', 'print hello', /is Python, not E\+\+/);
{
  // ...while real Python, properly wrapped and with the library, works.
  const seen = [];
  await run(
    'library "Python" add\npython code "print(\'HELLO\')"',
    { pythonExecutor: async (code) => { seen.push(code); } }
  );
  assert.deepEqual(seen, ["print('HELLO')"]);
  ok('python code "..." with the library still reaches the runner');
}

console.log('Increase / Decrease');
{
  const { output } = await run(
    'Define score as 10.\nIncrease score by 5\nsay \'score\'\nDecrease score by 3\nsay \'score\'\nIncrease \'score\' by 1 plus 1\nsay \'score\''
  );
  assert.deepEqual([...output], ['15', '12', '14']);
  ok('Increase <variable> by <amount> and Decrease <variable> by <amount> (bare, quoted and expression amounts)');
}
{
  const { output } = await run('ask "Score?" and save answer as score\nIncrease score by 2\nsay \'score\'', { answers: ['40'] });
  assert.deepEqual([...output], ['42']);
  ok('increasing a typed (numeric text) answer works');
}
await expectError('increasing an undefined variable explains how to define it', 'Increase missing by 1', /has not been defined yet/);
await expectError('decreasing text explains it is not a number', 'Define name as Bob.\nDecrease name by 1', /not a number/);
await expectError('increasing by text explains the amount must be a number', 'Define score as 1.\nIncrease score by "Bob"', /amount is not a number/);
await expectError('Increase without "by" is an English ParseError', 'Define score as 1.\nIncrease score 1', /needs the word "by"/);

console.log('Asking again, branches, comparisons, not-a-number');
{
  // Feature 2 exactly: the otherwise branch asks the same question again.
  const { output } = await run(
    'ask "What is 5 plus 6?" and save answer as output\n' +
    'if output is equal to 11 then say "Correct!" otherwise ask "What is 5 plus 6?" and save answer as output\n' +
    'say \'output\'',
    { answers: ['9', '11'] }
  );
  assert.deepEqual([...output], ['11']);
  ok('otherwise ask "..." asks again and saves the new answer');
}
{
  const program =
    'Define score as SCORE.\n' +
    'if \'score\' is greater than 90 then say "A" otherwise if \'score\' is greater than 80 then say "B" otherwise if \'score\' is greater than 70 then say "C" otherwise say "Keep going"';
  for (const [score, grade] of [[95, 'A'], [85, 'B'], [75, 'C'], [10, 'Keep going']]) {
    const { output } = await run(program.replace('SCORE', String(score)));
    assert.deepEqual([...output], [grade]);
  }
  ok('unlimited otherwise-if chains pick the first matching branch');
}
{
  const { output } = await run(
    'Define n as 7.\n' +
    'if \'n\' is greater than 10 then\n  say "big"\notherwise if \'n\' is lesser than 10 then\n  say "small"\notherwise\n  say "ten"\nend if'
  );
  assert.deepEqual([...output], ['small']);
  ok('block otherwise-if chains with end if');
}
{
  const program =
    'ask "Pick a number" and save answer as answer\n' +
    'if answer is equal to 1 then say "One" and\n' +
    'otherwise if not a number then say "Not a number" and\n' +
    'otherwise if answer is greater than 10 then say "Big" and\n' +
    'otherwise say "Small"';
  for (const [answer, expected] of [['1', 'One'], ['abc', 'Not a number'], ['42', 'Big'], ['5', 'Small'], ['', 'Not a number']]) {
    const { output } = await run(program, { answers: [answer] });
    assert.deepEqual([...output], [expected], 'answer: ' + JSON.stringify(answer));
  }
  ok('"and"-chained multi-line conditionals with implicit not-a-number detection');
}
{
  const { output } = await run('if 5 is lesser than 6 then say "yes" otherwise say "no"\nif 5 is greater than 6 then say "yes" otherwise say "no"');
  assert.deepEqual([...output], ['yes', 'no']);
  ok('is lesser than / is greater than comparisons');
}
{
  const { output } = await run('ask "Age?" and save answer as age\nif \'age\' is not a number then say "Numbers only" otherwise say "Thanks"', { answers: ['twelve'] });
  assert.deepEqual([...output], ['Numbers only']);
  ok('explicit if <variable> is not a number then ...');
}

console.log('Python library');
await expectError('python code without the Python library is a clear English LibraryError',
  'python code "print(1)"', /You cannot run Python code yet, because the Python library has not been added/);
await expectError('python code before the library line is still refused (order matters)',
  'python code "print(1)"\nlibrary "Python" add', /Python library has not been added/);
await expectError('a library line inside a branch that never runs does not unlock Python',
  'if 1 is equal to 2 then library "Python" add\npython code "print(1)"', /Python library has not been added/);
await expectError('a library line inside a repeat that never runs does not unlock Python',
  'repeat 0 times library "Python" add\npython code "print(1)"', /Python library has not been added/);
{
  const seen = [];
  const { output } = await run('library "Python" add\npython code "print(\'Hello from Python\')"', {
    pythonExecutor: async (code) => { seen.push(code); }
  });
  assert.deepEqual(seen, ["print('Hello from Python')"]);
  assert.deepEqual([...output], []);
  ok('library "Python" add unlocks single-line python code "..."');
}
{
  const seen = [];
  await run(
    'library "Python" add\n' +
    'python code "-total = 1 + 2  # E++ words like say and Define mean nothing here\n' +
    'for i in range(3):\n' +
    '    print(i)\n' +
    '"\n' +
    'say "done"',
    { pythonExecutor: async (code) => { seen.push(code); } }
  );
  assert.equal(seen.length, 1);
  assert.ok(seen[0].startsWith('total = 1 + 2'));
  assert.ok(seen[0].includes('for i in range(3):\n    print(i)\n'));
  ok('dash mode passes the whole multi-line block through raw, with no E++ parsing');
}
await expectError('an unterminated Python block is an English LexError',
  'library "Python" add\npython code "-print(1)\nprint(2)', /Python code block never ends/);
await expectError('python code without quotes is an English ParseError',
  'library "Python" add\npython code print(1)', /must be written inside double quotes/);
await expectError('python without a connected runner is an English RuntimeError',
  'library "Python" add\npython code "print(1)"', /no Python runner is connected/);
{
  let caught = null;
  try {
    await run('library "Python" add\npython code "print(missing)"', {
      pythonExecutor: async () => { throw new Error("Traceback...\nNameError: name 'missing' is not defined"); }
    });
  } catch (e) { caught = e; }
  assert.ok(caught, 'expected a Python error');
  assert.match(caught.format(), /Python stopped with a problem: Python tried to use a name that has not been created yet \(Python calls this a NameError\)\./);
  assert.match(caught.format(), /Hint:/);
  assert.doesNotMatch(caught.format(), /Traceback|File "<exec>"/);
  ok('Python failures become our own English errors — no Python traceback text is shown');
}
{
  // Runtime gating even when the AST was built by hand (no parser).
  const interpreter = new EPP.Interpreter({ output: () => {}, pythonExecutor: async () => {} });
  const program = EPP.AST.Program([EPP.AST.PythonCode('print(1)', { line: 3, column: 1 })]);
  await assert.rejects(() => interpreter.run(program), /Python library has not been added/);
  ok('the runtime also refuses python code without the Python library');
}

console.log('Libraries');
{
  const { output, interpreter } = await run(
    'library "Math" add\n' +
    'display 1 divided by 2 as fraction\n' +
    'display 1 divided by 2 as decimal\n' +
    'display 1 divided by 3 as fraction\n' +
    'say 50 percent of 200\n' +
    'say square root of 16\n' +
    'say 2 power of 3'
  );
  assert.deepEqual([...output], ['1/2', '0.5', '1/3', '100', '4', '8']);
  assert.ok(interpreter.loadedLibraries.has('Math'));
  ok('Math library: divided by, as fraction/decimal, percent of, square root of, power of');
}
await expectError('using Math features without the library is a LibraryError', 'say square root of 16', /Math library/);
await expectError('divided by is gated by the Math library too', 'say 1 divided by 2', /Math library/);
await expectError('unknown libraries are rejected', 'library "Everything" add', /no library called/);
{
  const { output } = await run('library "Text" add\nsay uppercase of "hello"\nsay length of "hello"');
  assert.deepEqual([...output], ['HELLO', '5']);
  ok('Text library unlocks its functions only after being added');
}
await expectError('Text functions without Text library fail', 'say uppercase of "hello"', /Text library/);

console.log('Errors');
await expectError('undefined variable is a RuntimeError with a hint', 'say \'missing\'', /has not been defined/);
await expectError('division by zero is reported', 'library "Math" add\nsay 1 divided by 0 as decimal', /Division by zero/);
await expectError('unterminated if block is a ParseError', 'if 1 is equal to 1 then\n  say "x"', /never ends/);
await expectError('nonsense statements are ParseErrors', 'frobnicate the wizzle', /do not understand/);

console.log('.eppl file system');
{
  const store = new EPP.EpplFileStore(new EPP.MemoryStorage());
  assert.equal(EPP.isEpplFile('a.eppl'), true);
  assert.equal(EPP.isEpplFile('a.txt'), false);
  assert.equal(EPP.validateEpplFileName('quiz'), 'quiz.eppl');
  assert.throws(() => EPP.validateEpplFileName('quiz.txt'), /only works with .eppl/);
  store.createFile('demo', 'say "hi"');
  assert.equal(store.getFile('demo.eppl').content, 'say "hi"');
  store.saveFile('demo.eppl', 'say "bye"');
  assert.equal(store.getFile('demo.eppl').content, 'say "bye"');
  store.renameFile('demo.eppl', 'renamed');
  assert.ok(store.exists('renamed.eppl'));
  assert.throws(() => store.importText('evil.js', 'alert(1)'), /only opens .eppl/);
  assert.equal(store.importText('ok.eppl', 'say 1').name, 'ok.eppl');
  store.deleteFile('renamed.eppl');
  assert.equal(store.exists('renamed.eppl'), false);
  ok('create/save/rename/delete + .eppl-only validation');
}

console.log('Syntax highlighting');
{
  const html = EPP.highlight('say "Hello" plus \'name\'');
  assert.match(html, /tok-keyword/);
  assert.match(html, /tok-string/);
  assert.match(html, /tok-variable/);
  assert.match(html, /tok-operator/);
  ok('lexer-driven highlighting emits token classes');
}

console.log('\nAll ' + passed + ' E++ test groups passed.');
